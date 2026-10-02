import type { TieBreakerKind } from '../../types';
import type { Working } from './scenarioModel';

function headToHeadKeys(work: Working, run: readonly number[], kind: 'head_to_head' | 'head_to_head_wins'): number[] | null {
  const slotOf = new Array<number>(work.n).fill(-1);
  for (let position = 0; position < run.length; position += 1) slotOf[run[position]] = position;
  const totals = new Array<number>(run.length).fill(0);
  const met = work.requireComplete ? new Array<boolean>(work.n * work.n).fill(false) : null;
  const points = kind === 'head_to_head';
  const add = (i: number, j: number, valueI: number, valueJ: number) => {
    const a = slotOf[i];
    const b = slotOf[j];
    if (a < 0 || b < 0) return;
    totals[a] -= valueI;
    totals[b] -= valueJ;
    if (met) met[Math.min(i, j) * work.n + Math.max(i, j)] = true;
  };
  for (let p = 0; p < work.pairs.length; p += 1) {
    const pair = work.pairs[p];
    add(pair.i, pair.j, points ? pair.pointsI : pair.winI, points ? pair.pointsJ : pair.winJ);
  }
  for (let k = 0; k < work.open.length; k += 1) {
    const fixture = work.open[k];
    const chosen = work.chosen[k];
    if (!chosen || fixture.i < 0 || fixture.j < 0) continue;
    add(fixture.i, fixture.j, points ? chosen.pointsA : chosen.winA, points ? chosen.pointsB : chosen.winB);
  }
  if (met) {
    for (let x = 0; x < run.length; x += 1) {
      for (let y = x + 1; y < run.length; y += 1) {
        if (!met[Math.min(run[x], run[y]) * work.n + Math.max(run[x], run[y])]) return null;
      }
    }
  }
  return totals;
}

function keysFor(work: Working, kind: TieBreakerKind, run: readonly number[]): number[] | null {
  switch (kind) {
    case 'points':
      return run.map((team) => -work.points[team]);
    case 'wins':
      return run.map((team) => -work.won[team]);
    case 'fewer_losses':
      return run.map((team) => work.lost[team]);
    case 'seed':
      return run.map((team) => work.seeds[team] ?? Number.POSITIVE_INFINITY);
    case 'head_to_head':
    case 'head_to_head_wins':
      return headToHeadKeys(work, run, kind);
    default:
      return null;
  }
}

function splitRun(run: readonly number[], keys: readonly number[], into: number[][]): void {
  const order = run.map((_, position) => position).sort((a, b) => keys[a] - keys[b]);
  let current: number[] = [];
  for (let k = 0; k < order.length; k += 1) {
    if (current.length > 0 && keys[order[k]] !== keys[order[k - 1]]) {
      into.push(current);
      current = [];
    }
    current.push(run[order[k]]);
  }
  if (current.length > 0) into.push(current);
}

export function rankScenario(work: Working): { readonly best: number[]; readonly worst: number[] } {
  let runs: number[][] = [Array.from({ length: work.n }, (_, i) => i)];
  for (let c = 0; c < work.prefix.length; c += 1) {
    const next: number[][] = [];
    for (let r = 0; r < runs.length; r += 1) {
      const run = runs[r];
      const keys = run.length < 2 ? null : keysFor(work, work.prefix[c], run);
      if (keys) splitRun(run, keys, next);
      else next.push(run);
    }
    runs = next;
  }
  const best = new Array<number>(work.n).fill(0);
  const worst = new Array<number>(work.n).fill(0);
  let start = 0;
  for (let r = 0; r < runs.length; r += 1) {
    const run = runs[r];
    for (let k = 0; k < run.length; k += 1) {
      best[run[k]] = start + 1;
      worst[run[k]] = start + run.length;
    }
    start += run.length;
  }
  return { best, worst };
}

export const CRITERION_CODE: Readonly<Partial<Record<TieBreakerKind, number>>> = { points: 0, wins: 1, fewer_losses: 2, seed: 3 };

function criterionDifference(work: Working, code: number, u: number, t: number): number {
  if (code === 0) return work.points[t] - work.points[u];
  if (code === 1) return work.won[t] - work.won[u];
  if (code === 2) return work.lost[u] - work.lost[t];
  const seedU = work.seeds[u] ?? Number.POSITIVE_INFINITY;
  const seedT = work.seeds[t] ?? Number.POSITIVE_INFINITY;
  return seedU === seedT ? 0 : seedU < seedT ? -1 : 1;
}

function rankByPoints(work: Working, best: number[], worst: number[]): void {
  const n = work.n;
  const points = work.points;
  for (let t = 0; t < n; t += 1) {
    best[t] = 1;
    worst[t] = 1;
  }
  for (let t = 0; t < n; t += 1) {
    const own = points[t];
    for (let u = t + 1; u < n; u += 1) {
      const other = points[u];
      if (other > own) {
        best[t] += 1;
        worst[t] += 1;
      } else if (other < own) {
        best[u] += 1;
        worst[u] += 1;
      } else {
        worst[t] += 1;
        worst[u] += 1;
      }
    }
  }
}

export function rankByCounting(work: Working, codes: readonly number[], best: number[], worst: number[]): void {
  if (codes.length === 1 && codes[0] === 0) {
    rankByPoints(work, best, worst);
    return;
  }
  const n = work.n;
  const depth = codes.length;
  for (let t = 0; t < n; t += 1) {
    best[t] = 1;
    worst[t] = 1;
  }
  for (let t = 0; t < n; t += 1) {
    for (let u = t + 1; u < n; u += 1) {
      let order = 0;
      for (let k = 0; k < depth && order === 0; k += 1) order = criterionDifference(work, codes[k], u, t);
      if (order < 0) {
        best[t] += 1;
        worst[t] += 1;
      } else if (order > 0) {
        best[u] += 1;
        worst[u] += 1;
      } else {
        worst[t] += 1;
        worst[u] += 1;
      }
    }
  }
}

export function usesHeadToHead(prefix: readonly TieBreakerKind[]): boolean {
  return prefix.some((kind) => kind === 'head_to_head' || kind === 'head_to_head_wins');
}

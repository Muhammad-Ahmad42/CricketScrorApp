import type { Outcome } from './outcomes';
import type { Working } from './scenarioModel';

export interface PruningTables {
  readonly n: number;
  readonly remainingMax: Float64Array;
  readonly remainingMin: Float64Array;
  readonly remainingWin: Float64Array;
  readonly remainingOpen: Int32Array;
}

export interface SearchExtremes {
  readonly minBest: readonly number[];
  readonly maxWorst: readonly number[];
  readonly maxWorstWinning: readonly number[];
  readonly openCount: readonly number[];
  readonly openWins: readonly number[];
}

interface SideRange {
  readonly max: number;
  readonly min: number;
  readonly win: number;
}

function sideRange(outcomes: readonly Outcome[], side: 'A' | 'B'): SideRange {
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  let win = Number.POSITIVE_INFINITY;
  for (const outcome of outcomes) {
    const points = side === 'A' ? outcome.pointsA : outcome.pointsB;
    const won = side === 'A' ? outcome.winA : outcome.winB;
    if (points > max) max = points;
    if (points < min) min = points;
    if (won === 1 && points < win) win = points;
  }
  return { max, min, win: win === Number.POSITIVE_INFINITY ? min : win };
}

export function pruningTables(work: Working): PruningTables | null {
  if (work.prefix[0] !== 'points' || work.open.length < 3) return null;
  const n = work.n;
  const depth = work.open.length;
  const remainingMax = new Float64Array((depth + 1) * n);
  const remainingMin = new Float64Array((depth + 1) * n);
  const remainingWin = new Float64Array((depth + 1) * n);
  const remainingOpen = new Int32Array((depth + 1) * n);
  for (let k = depth - 1; k >= 0; k -= 1) {
    const row = k * n;
    const next = row + n;
    for (let t = 0; t < n; t += 1) {
      remainingMax[row + t] = remainingMax[next + t];
      remainingMin[row + t] = remainingMin[next + t];
      remainingWin[row + t] = remainingWin[next + t];
      remainingOpen[row + t] = remainingOpen[next + t];
    }
    const fixture = work.open[k];
    if (fixture.i >= 0) {
      const range = sideRange(fixture.outcomes, 'A');
      remainingMax[row + fixture.i] += range.max;
      remainingMin[row + fixture.i] += range.min;
      remainingWin[row + fixture.i] += range.win;
      remainingOpen[row + fixture.i] += 1;
    }
    if (fixture.j >= 0) {
      const range = sideRange(fixture.outcomes, 'B');
      remainingMax[row + fixture.j] += range.max;
      remainingMin[row + fixture.j] += range.min;
      remainingWin[row + fixture.j] += range.win;
      remainingOpen[row + fixture.j] += 1;
    }
  }
  return { n, remainingMax, remainingMin, remainingWin, remainingOpen };
}

export function subtreeSettled(points: readonly number[], tables: PruningTables, k: number, extremes: SearchExtremes): boolean {
  const n = tables.n;
  const row = k * n;
  for (let t = 0; t < n; t += 1) {
    const ceiling = points[t] + tables.remainingMax[row + t];
    const floor = points[t] + tables.remainingMin[row + t];
    const winningFloor = points[t] + tables.remainingWin[row + t];
    let above = 0;
    let levelOrAbove = 0;
    let levelOrAboveWinning = 0;
    for (let u = 0; u < n; u += 1) {
      if (u === t) continue;
      const otherCeiling = points[u] + tables.remainingMax[row + u];
      if (points[u] + tables.remainingMin[row + u] > ceiling) above += 1;
      if (otherCeiling >= floor) levelOrAbove += 1;
      if (otherCeiling >= winningFloor) levelOrAboveWinning += 1;
    }
    if (above + 1 < extremes.minBest[t]) return false;
    if (levelOrAbove + 1 > extremes.maxWorst[t]) return false;
    const decided = extremes.openCount[t] - tables.remainingOpen[row + t];
    const canWinAll = extremes.openCount[t] > 0 && extremes.openWins[t] === decided;
    if (canWinAll && levelOrAboveWinning + 1 > extremes.maxWorstWinning[t]) return false;
  }
  return true;
}

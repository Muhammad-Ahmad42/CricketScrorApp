import type { StandingsTable, TeamId } from '../../types';
import type { Outcome } from './outcomes';
import type { OpenFixture, PoolScenarioAnalysis, PositionBounds, Working } from './scenarioModel';
import { pruningTables, subtreeSettled } from './scenarioPruning';
import { CRITERION_CODE, rankByCounting, rankScenario, usesHeadToHead } from './scenarioRanking';

export function completeBounds(table: StandingsTable, teams: readonly TeamId[]): ReadonlyMap<TeamId, PositionBounds> {
  const bounds = new Map<TeamId, PositionBounds>();
  const eligible = new Set(teams);
  const rows = table.rows.filter(
    (row): row is typeof row & { readonly teamId: TeamId } => row.teamId !== null && eligible.has(row.teamId),
  );
  for (const row of rows) {
    const group = rows.filter((other) => other.position === row.position);
    const first = rows.indexOf(group[0]);
    bounds.set(row.teamId, { best: first + 1, worst: first + group.length, worstWinningAll: null });
  }
  return bounds;
}

export function uncertain(teams: readonly TeamId[], remaining: ReadonlyMap<TeamId, readonly TeamId[]>, capacity = teams.length): PoolScenarioAnalysis {
  const bounds = new Map<TeamId, PositionBounds>();
  teams.forEach((teamId) => bounds.set(teamId, { best: 1, worst: Math.max(capacity, teams.length), worstWinningAll: null }));
  return { exact: false, size: teams.length, teams, bounds, remaining };
}

export function pointBounds(work: Working, teams: readonly TeamId[], remaining: ReadonlyMap<TeamId, readonly TeamId[]>): PoolScenarioAnalysis {
  if (work.prefix[0] !== 'points') return uncertain(teams, remaining);
  const maxPts = [...work.points];
  const minPts = [...work.points];
  for (const fixture of work.open) {
    if (fixture.i >= 0) {
      maxPts[fixture.i] += Math.max(...fixture.outcomes.map((o) => o.pointsA));
      minPts[fixture.i] += Math.min(...fixture.outcomes.map((o) => o.pointsA));
    }
    if (fixture.j >= 0) {
      maxPts[fixture.j] += Math.max(...fixture.outcomes.map((o) => o.pointsB));
      minPts[fixture.j] += Math.min(...fixture.outcomes.map((o) => o.pointsB));
    }
  }
  const bounds = new Map<TeamId, PositionBounds>();
  teams.forEach((teamId, i) => {
    let above = 0;
    let possiblyAbove = 0;
    for (let u = 0; u < teams.length; u += 1) {
      if (u === i) continue;
      if (minPts[u] > maxPts[i]) above += 1;
      if (maxPts[u] >= minPts[i]) possiblyAbove += 1;
    }
    bounds.set(teamId, { best: above + 1, worst: possiblyAbove + 1, worstWinningAll: null });
  });
  return { exact: false, size: teams.length, teams, bounds, remaining };
}

interface EnumerationState {
  readonly minBest: number[];
  readonly maxWorst: number[];
  readonly maxWorstWinning: number[];
  readonly openCount: number[];
  readonly openWins: number[];
  readonly best: number[];
  readonly worst: number[];
}

function recordLeaf(work: Working, state: EnumerationState, codes: readonly number[] | null): void {
  if (codes) rankByCounting(work, codes, state.best, state.worst);
  else {
    const ranked = rankScenario(work);
    for (let t = 0; t < work.n; t += 1) {
      state.best[t] = ranked.best[t];
      state.worst[t] = ranked.worst[t];
    }
  }
  for (let t = 0; t < work.n; t += 1) {
    if (state.best[t] < state.minBest[t]) state.minBest[t] = state.best[t];
    if (state.worst[t] > state.maxWorst[t]) state.maxWorst[t] = state.worst[t];
    if (state.openCount[t] > 0 && state.openWins[t] === state.openCount[t] && state.worst[t] > state.maxWorstWinning[t]) {
      state.maxWorstWinning[t] = state.worst[t];
    }
  }
}

function applyOption(work: Working, state: EnumerationState, fixture: OpenFixture, option: Outcome, sign: number): void {
  if (fixture.i >= 0) {
    work.points[fixture.i] += sign * option.pointsA;
    work.won[fixture.i] += sign * option.winA;
    work.lost[fixture.i] += sign * option.lossA;
    state.openWins[fixture.i] += sign * option.winA;
  }
  if (fixture.j >= 0) {
    work.points[fixture.j] += sign * option.pointsB;
    work.won[fixture.j] += sign * option.winB;
    work.lost[fixture.j] += sign * option.lossB;
    state.openWins[fixture.j] += sign * option.winB;
  }
}

export function enumerate(work: Working, teams: readonly TeamId[], remaining: ReadonlyMap<TeamId, readonly TeamId[]>): PoolScenarioAnalysis {
  const codes = usesHeadToHead(work.prefix) ? null : work.prefix.map((kind) => CRITERION_CODE[kind] ?? 0);
  const state: EnumerationState = {
    minBest: new Array<number>(work.n).fill(Number.POSITIVE_INFINITY),
    maxWorst: new Array<number>(work.n).fill(0),
    maxWorstWinning: new Array<number>(work.n).fill(0),
    openCount: new Array<number>(work.n).fill(0),
    openWins: new Array<number>(work.n).fill(0),
    best: new Array<number>(work.n).fill(0),
    worst: new Array<number>(work.n).fill(0),
  };
  work.open.forEach((fixture) => {
    if (fixture.i >= 0) state.openCount[fixture.i] += 1;
    if (fixture.j >= 0) state.openCount[fixture.j] += 1;
  });
  const tables = pruningTables(work);
  const lastCheck = work.open.length - 2;
  const visit = (k: number): void => {
    if (k === work.open.length) {
      recordLeaf(work, state, codes);
      return;
    }
    if (tables && k > 0 && k <= lastCheck && subtreeSettled(work.points, tables, k, state)) return;
    const fixture = work.open[k];
    const options = fixture.outcomes;
    for (let o = 0; o < options.length; o += 1) {
      const option = options[o];
      work.chosen[k] = option;
      applyOption(work, state, fixture, option, 1);
      visit(k + 1);
      applyOption(work, state, fixture, option, -1);
    }
    work.chosen[k] = null;
  };
  visit(0);
  const bounds = new Map<TeamId, PositionBounds>();
  teams.forEach((teamId, t) => {
    bounds.set(teamId, {
      best: state.minBest[t],
      worst: state.maxWorst[t],
      worstWinningAll: state.openCount[t] > 0 && state.maxWorstWinning[t] > 0 ? state.maxWorstWinning[t] : null,
    });
  });
  return { exact: true, size: teams.length, teams, bounds, remaining };
}

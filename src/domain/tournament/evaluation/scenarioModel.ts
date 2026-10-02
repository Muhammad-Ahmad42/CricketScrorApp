import type { TeamId, TieBreakerKind } from '../../types';
import type { Outcome } from './outcomes';

export interface PositionBounds {
  readonly best: number;
  readonly worst: number;
  readonly worstWinningAll: number | null;
}

export interface PoolScenarioAnalysis {
  readonly exact: boolean;
  readonly size: number;
  readonly teams: readonly TeamId[];
  readonly bounds: ReadonlyMap<TeamId, PositionBounds>;
  readonly remaining: ReadonlyMap<TeamId, readonly TeamId[]>;
}

export const DEFAULT_ENUMERATION_LIMIT = 8;
export const MAX_SCENARIOS = 65536;

const DECISIVE: ReadonlySet<TieBreakerKind> = new Set(['points', 'wins', 'fewer_losses', 'head_to_head', 'head_to_head_wins', 'seed']);

export function decisivePrefix(chain: readonly TieBreakerKind[]): readonly TieBreakerKind[] {
  const prefix: TieBreakerKind[] = [];
  for (const kind of chain) {
    if (!DECISIVE.has(kind)) break;
    prefix.push(kind);
  }
  return prefix;
}

export interface PairResult {
  readonly i: number;
  readonly j: number;
  readonly pointsI: number;
  readonly pointsJ: number;
  readonly winI: number;
  readonly winJ: number;
}

export interface OpenFixture {
  readonly i: number;
  readonly j: number;
  readonly outcomes: readonly Outcome[];
}

export interface Working {
  readonly n: number;
  readonly points: number[];
  readonly won: number[];
  readonly lost: number[];
  readonly seeds: readonly (number | null)[];
  readonly pairs: readonly PairResult[];
  readonly open: readonly OpenFixture[];
  readonly chosen: (Outcome | null)[];
  readonly prefix: readonly TieBreakerKind[];
  readonly requireComplete: boolean;
}

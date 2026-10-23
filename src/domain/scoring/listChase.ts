import type { BallCount, ListChase, Runs } from '../types';

export interface ChaseLineInput {
  readonly status: 'in_progress' | 'complete';
  readonly target: Runs | null;
  readonly runs: Runs;
  readonly legalBalls: BallCount;
  readonly maxBalls: BallCount;
}

export function listChase(line: ChaseLineInput): ListChase | null {
  if (line.status !== 'in_progress' || line.target === null) {
    return null;
  }
  return {
    runsRequired: Math.max(0, line.target - line.runs),
    ballsRemaining: Math.max(0, line.maxBalls - line.legalBalls),
  };
}

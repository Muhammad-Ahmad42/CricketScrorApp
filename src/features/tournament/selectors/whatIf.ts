import type {
  Fixture,
  HypotheticalOutcome,
  HypotheticalResult,
  HypotheticalScore,
  StandingChange,
  WhatIfResult,
} from '@/domain/types';
import { fixtureRow, isUnplayed, sortFixtures, type FixtureRowVM } from './fixtures';
import type { TournamentIndex } from './names';
import { standingRowVM, type StandingRowVM } from './standings';

export const OUTCOME_KEYS: { readonly [K in HypotheticalOutcome]: string } = {
  side_a_win: 'side-a',
  side_b_win: 'side-b',
  tie: 'tie',
  no_result: 'no-result',
  abandoned: 'abandoned',
  side_a_walkover: 'walkover-a',
  side_b_walkover: 'walkover-b',
};

export function outcomeLabel(outcome: HypotheticalOutcome, row: Pick<FixtureRowVM, 'a' | 'b'>): string {
  switch (outcome) {
    case 'side_a_win':
      return `${row.a.text} win`;
    case 'side_b_win':
      return `${row.b.text} win`;
    case 'tie':
      return 'Tie';
    case 'no_result':
      return 'No result';
    case 'abandoned':
      return 'Abandoned';
    case 'side_a_walkover':
      return `Walkover to ${row.a.text}`;
    case 'side_b_walkover':
      return `Walkover to ${row.b.text}`;
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
}

export function remainingFixtures(index: TournamentIndex): readonly Fixture[] {
  const unplayed = index.snapshot.fixtures.filter(isUnplayed);
  const currentStageId = index.evaluation?.currentStageId ?? null;
  const current = unplayed.filter((fixture) => fixture.stageId === currentStageId);
  return sortFixtures(current.length > 0 ? current : unplayed, index);
}

export function remainingRows(index: TournamentIndex): readonly FixtureRowVM[] {
  return remainingFixtures(index).map((fixture) => fixtureRow(index, fixture));
}

export function parseOvers(text: string, ballsPerOver: number): number | null {
  const match = /^(\d+)(?:\.(\d))?$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const overs = Number(match[1]);
  const balls = match[2] === undefined ? 0 : Number(match[2]);
  if (balls >= ballsPerOver) {
    return null;
  }
  return overs * ballsPerOver + balls;
}

export interface ScoreInput {
  readonly battingFirst: 'side_a' | 'side_b';
  readonly firstRuns: string;
  readonly firstOvers: string;
  readonly secondRuns: string;
  readonly secondOvers: string;
}

function parseRuns(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

export function scoreFromInput(input: ScoreInput, ballsPerOver: number): HypotheticalScore | null {
  const firstRuns = parseRuns(input.firstRuns);
  const secondRuns = parseRuns(input.secondRuns);
  const firstBalls = parseOvers(input.firstOvers, ballsPerOver);
  const secondBalls = parseOvers(input.secondOvers, ballsPerOver);
  if (firstRuns === null || secondRuns === null || firstBalls === null || secondBalls === null || firstBalls === 0 || secondBalls === 0) {
    return null;
  }
  return {
    battingFirst: input.battingFirst,
    firstInnings: { runs: firstRuns, balls: firstBalls, allOut: false },
    secondInnings: { runs: secondRuns, balls: secondBalls, allOut: false },
  };
}

export interface WhatIfTableRow {
  readonly row: StandingRowVM;
  readonly delta: string;
}

export interface WhatIfTableVM {
  readonly key: string;
  readonly title: string;
  readonly rows: readonly WhatIfTableRow[];
}

function deltaText(change: StandingChange | undefined): string {
  if (!change || change.before === null || change.after === null) {
    return '–';
  }
  const moved = change.before.position - change.after.position;
  if (moved > 0) {
    return `▲${moved}`;
  }
  if (moved < 0) {
    return `▼${-moved}`;
  }
  return '–';
}

export function whatIfTables(index: TournamentIndex, result: WhatIfResult): readonly WhatIfTableVM[] {
  const touched = new Set(result.standingChanges.map((change) => `${change.stageId}:${change.poolId ?? ''}`));
  return result.after.tables
    .filter((table) => touched.has(`${table.stageId}:${table.poolId ?? ''}`))
    .map((table) => {
      const key = table.poolId ? index.poolKey(table.poolId) : 'overall';
      return {
        key: `${table.stageId}:${key}`,
        title: (table.poolId ? index.poolName(table.poolId) : null) ?? index.stageName(table.stageId),
        rows: table.rows.map((row) => ({
          row: standingRowVM(index, row, key),
          delta: deltaText(
            result.standingChanges.find(
              (change) => change.stageId === table.stageId && change.poolId === table.poolId && change.teamId === row.teamId,
            ),
          ),
        })),
      };
    });
}

export function hypothetical(fixtureId: string, outcome: HypotheticalOutcome, score: HypotheticalScore | null, tieWinner: 'side_a' | 'side_b' | null): HypotheticalResult {
  return { fixtureId, outcome, score, tieWinner: outcome === 'tie' ? tieWinner : null };
}

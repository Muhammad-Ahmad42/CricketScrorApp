import type { BallCount, DismissalRecord, InningsState, MatchState, PlayerId, Runs, TeamId } from '../types';

export function ballsToOvers(balls: BallCount, ballsPerOver: number): number {
  return balls / ballsPerOver;
}

export function strikeRate(runs: Runs, ballsFaced: BallCount): number | null {
  return ballsFaced > 0 ? (runs * 100) / ballsFaced : null;
}

export function economyRate(runsConceded: Runs, legalBalls: BallCount, ballsPerOver: number): number | null {
  return legalBalls > 0 ? (runsConceded * ballsPerOver) / legalBalls : null;
}

export function runRate(runs: Runs, legalBalls: BallCount, ballsPerOver: number): number | null {
  return legalBalls > 0 ? (runs * ballsPerOver) / legalBalls : null;
}

export function requiredRunRate(runsRequired: Runs, ballsRemaining: BallCount, ballsPerOver: number): number | null {
  return ballsRemaining > 0 ? (runsRequired * ballsPerOver) / ballsRemaining : null;
}

export function battingAverage(runs: Runs, dismissals: number): number | null {
  return dismissals > 0 ? runs / dismissals : null;
}

export interface WormPoint {
  readonly legalBalls: BallCount;
  readonly runs: Runs;
  readonly wickets: number;
}

export function worm(state: MatchState): readonly { readonly inningsIndex: number; readonly teamId: TeamId; readonly points: readonly WormPoint[] }[] {
  return state.innings
    .filter((innings) => innings.kind === 'regular')
    .map((innings) => {
      const points: WormPoint[] = [{ legalBalls: 0, runs: 0, wickets: 0 }];
      let legalBalls = 0;
      for (const over of innings.overs) {
        legalBalls += over.legalBalls;
        points.push({ legalBalls, runs: over.scoreAtEnd.runs, wickets: over.scoreAtEnd.wickets });
      }
      return { inningsIndex: innings.index, teamId: innings.battingTeamId, points };
    });
}

export interface ManhattanBar {
  readonly overIndex: number;
  readonly runs: Runs;
  readonly wickets: number;
}

export function manhattan(innings: InningsState): readonly ManhattanBar[] {
  return innings.overs.map((over) => ({ overIndex: over.overIndex, runs: over.runs, wickets: over.wickets }));
}

export function boundaryCounts(state: MatchState): readonly { readonly teamId: TeamId; readonly fours: number; readonly sixes: number }[] {
  const order: TeamId[] = [];
  const totals = new Map<TeamId, { fours: number; sixes: number }>();
  const ensure = (teamId: TeamId): { fours: number; sixes: number } => {
    const existing = totals.get(teamId);
    if (existing !== undefined) {
      return existing;
    }
    const created = { fours: 0, sixes: 0 };
    totals.set(teamId, created);
    order.push(teamId);
    return created;
  };
  for (const innings of state.innings) {
    const batting = ensure(innings.battingTeamId);
    ensure(innings.bowlingTeamId);
    for (const ball of innings.balls) {
      if (ball.isFour) {
        batting.fours += 1;
      }
      if (ball.isSix) {
        batting.sixes += 1;
      }
    }
  }
  return order.map((teamId) => {
    const entry = totals.get(teamId) ?? { fours: 0, sixes: 0 };
    return { teamId, fours: entry.fours, sixes: entry.sixes };
  });
}

export interface PlayerMatchStats {
  readonly playerId: PlayerId;
  readonly batting: { readonly runs: Runs; readonly balls: BallCount; readonly fours: number; readonly sixes: number; readonly out: boolean } | null;
  readonly bowling: { readonly legalBalls: BallCount; readonly maidens: number; readonly runs: Runs; readonly wickets: number } | null;
  readonly catches: number;
  readonly stumpings: number;
  readonly runOuts: number;
}

function inningsDismissals(innings: InningsState): readonly DismissalRecord[] {
  return innings.batting.flatMap((row) => (row.dismissal === null ? [] : [row.dismissal]));
}

export function playerMatchStats(state: MatchState, playerId: PlayerId): PlayerMatchStats {
  let batting: PlayerMatchStats['batting'] = null;
  let bowling: PlayerMatchStats['bowling'] = null;
  let catches = 0;
  let stumpings = 0;
  let runOuts = 0;
  for (const innings of state.innings) {
    if (innings.kind !== 'regular') {
      continue;
    }
    const battingRow = innings.batting.find((row) => row.playerId === playerId && row.position !== null);
    if (battingRow !== undefined) {
      const previous: NonNullable<PlayerMatchStats['batting']> = batting ?? { runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
      batting = {
        runs: previous.runs + battingRow.runs,
        balls: previous.balls + battingRow.balls,
        fours: previous.fours + battingRow.fours,
        sixes: previous.sixes + battingRow.sixes,
        out: previous.out || battingRow.status === 'out',
      };
    }
    const bowlingRow = innings.bowling.find((row) => row.playerId === playerId);
    if (bowlingRow !== undefined) {
      const previous: NonNullable<PlayerMatchStats['bowling']> = bowling ?? { legalBalls: 0, maidens: 0, runs: 0, wickets: 0 };
      bowling = {
        legalBalls: previous.legalBalls + bowlingRow.legalBalls,
        maidens: previous.maidens + bowlingRow.maidens,
        runs: previous.runs + bowlingRow.runsConceded,
        wickets: previous.wickets + bowlingRow.wickets,
      };
    }
    for (const dismissal of inningsDismissals(innings)) {
      if (dismissal.type === 'caught' && dismissal.fielderIds[0] === playerId) {
        catches += 1;
      }
      if (dismissal.type === 'stumped' && dismissal.fielderIds[0] === playerId) {
        stumpings += 1;
      }
      if (dismissal.type === 'run_out' && dismissal.fielderIds.includes(playerId)) {
        runOuts += 1;
      }
    }
  }
  return { playerId, batting, bowling, catches, stumpings, runOuts };
}

import type { FormResult, MatchSummary, NrrConfig, PointsSystem, TeamId } from '../../types';
import { matchNrrContributions } from '../nrr';

export interface SideOutcome {
  readonly points: number;
  readonly bonus: number;
  readonly column: FormResult;
}

export interface ResultOutcome {
  readonly a: SideOutcome;
  readonly b: SideOutcome;
}

function side(points: number, column: FormResult, bonus = 0): SideOutcome {
  return { points: points + bonus, bonus, column };
}

function winLoss(summary: MatchSummary, winner: TeamId, winPoints: number, lossPoints: number, bonus: number): ResultOutcome {
  const winnerSide = side(winPoints, 'W', bonus);
  const loserSide = side(lossPoints, 'L');
  return winner === summary.teamAId ? { a: winnerSide, b: loserSide } : { a: loserSide, b: winnerSide };
}

function both(points: number, column: FormResult): ResultOutcome {
  return { a: side(points, column), b: side(points, column) };
}

export function bonusFor(summary: MatchSummary, winner: TeamId, points: PointsSystem, nrr: NrrConfig): number {
  if (!points.bonus || summary.result.type !== 'win') return 0;
  if (summary.hypothetical) return summary.hypothetical.bonus ? points.bonus.points : 0;
  if (summary.innings.length < 2) return 0;
  const contributions = matchNrrContributions(summary, nrr);
  if (!contributions) return 0;
  const winnerLine = contributions.find((line) => line.teamId === winner);
  const loserLine = contributions.find((line) => line.teamId !== winner);
  if (!winnerLine || !loserLine || winnerLine.oversFor === 0 || loserLine.oversFor === 0) return 0;
  const winnerRate = winnerLine.runsFor / winnerLine.oversFor;
  const loserRate = loserLine.runsFor / loserLine.oversFor;
  return winnerRate >= points.bonus.ratio * loserRate - 1e-9 ? points.bonus.points : 0;
}

export function resultOutcome(summary: MatchSummary, points: PointsSystem, nrr: NrrConfig): ResultOutcome {
  const result = summary.result;
  switch (result.type) {
    case 'win':
      return winLoss(summary, result.winnerTeamId, points.win, points.loss, bonusFor(summary, result.winnerTeamId, points, nrr));
    case 'tie':
      if (result.decider && points.superOverDecidedTie === 'win_loss') {
        return winLoss(summary, result.decider.winnerTeamId, points.win, points.loss, 0);
      }
      return both(points.tie, 'T');
    case 'no_result':
      return both(points.noResult, 'N');
    case 'abandoned':
      return both(points.abandoned ?? points.noResult, 'N');
    case 'walkover':
      return winLoss(summary, result.winnerTeamId, points.walkoverWin ?? points.win, points.walkoverLoss ?? points.loss, 0);
    case 'awarded':
      return result.winnerTeamId === null
        ? both(points.noResult, 'N')
        : winLoss(summary, result.winnerTeamId, points.win, points.loss, 0);
    default: {
      const never: never = result;
      return never;
    }
  }
}

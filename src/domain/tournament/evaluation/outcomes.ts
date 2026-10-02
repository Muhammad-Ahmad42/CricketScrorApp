import type { PointsSystem } from '../../types';

export interface Outcome {
  readonly pointsA: number;
  readonly pointsB: number;
  readonly winA: number;
  readonly winB: number;
  readonly lossA: number;
  readonly lossB: number;
}

function outcome(pointsA: number, pointsB: number, winA: number, winB: number): Outcome {
  return { pointsA, pointsB, winA, winB, lossA: winB, lossB: winA };
}

export function outcomeSet(points: PointsSystem, withColumns: boolean): readonly Outcome[] {
  const bonus = points.bonus?.points ?? 0;
  const candidates: Outcome[] = [
    outcome(points.win, points.loss, 1, 0),
    outcome(points.loss, points.win, 0, 1),
    outcome(points.tie, points.tie, 0, 0),
    outcome(points.noResult, points.noResult, 0, 0),
    outcome(points.abandoned ?? points.noResult, points.abandoned ?? points.noResult, 0, 0),
    outcome(points.walkoverWin ?? points.win, points.walkoverLoss ?? points.loss, 1, 0),
    outcome(points.walkoverLoss ?? points.loss, points.walkoverWin ?? points.win, 0, 1),
  ];
  if (points.bonus) {
    candidates.push(outcome(points.win + bonus, points.loss, 1, 0), outcome(points.loss, points.win + bonus, 0, 1));
  }
  const seen = new Map<string, Outcome>();
  for (const candidate of candidates) {
    const key = withColumns
      ? `${candidate.pointsA}|${candidate.pointsB}|${candidate.winA}|${candidate.winB}`
      : `${candidate.pointsA}|${candidate.pointsB}`;
    if (!seen.has(key)) seen.set(key, candidate);
  }
  return [...seen.values()];
}

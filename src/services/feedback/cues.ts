import type { BallRecord, MatchEvent, MatchEventInput, MatchState } from '@/domain/types';

export type FeedbackCue = 'run' | 'four' | 'six' | 'wicket' | 'over_end' | 'result' | 'undo' | 'error' | 'confirm' | 'tab';

function committedBall(state: MatchState, eventId: string): BallRecord | null {
  for (let index = state.innings.length - 1; index >= 0; index -= 1) {
    const balls = state.innings[index].balls;
    for (let ball = balls.length - 1; ball >= 0; ball -= 1) {
      if (balls[ball].eventId === eventId) {
        return balls[ball];
      }
    }
  }
  return null;
}

function isOffBallWicket(event: MatchEvent | MatchEventInput): boolean {
  return event.kind === 'batter_dismissed' || (event.kind === 'batter_retired' && event.retirement === 'retired_out');
}

export function cueForCommit(state: MatchState, appended: readonly MatchEvent[]): FeedbackCue | null {
  if (appended.some((event) => event.kind === 'match_ended')) {
    return 'result';
  }
  if (appended.some(isOffBallWicket)) {
    return 'wicket';
  }
  const deliveries = appended.filter((event) => event.kind === 'delivery');
  const last = deliveries[deliveries.length - 1];
  if (last === undefined) {
    return null;
  }
  const ball = committedBall(state, last.id);
  if (ball === null) {
    return null;
  }
  if (ball.wicket !== null) {
    return 'wicket';
  }
  if (ball.boundary === 6) {
    return 'six';
  }
  if (ball.boundary === 4) {
    return 'four';
  }
  if (ball.totalRuns > 0) {
    return 'run';
  }
  return ball.endsOver ? 'over_end' : null;
}

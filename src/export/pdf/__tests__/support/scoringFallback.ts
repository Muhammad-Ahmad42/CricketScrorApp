import type { BallCount, MatchResult, MatchTeam, WinMargin } from '@/domain/types';

type FormatModule = typeof import('@/domain/scoring/format');
type ResultModule = typeof import('@/domain/scoring/result');

function formatOvers(balls: BallCount, ballsPerOver: number, opts?: { readonly alwaysShowBalls?: boolean }): string {
  const whole = Math.floor(balls / ballsPerOver);
  const rest = balls % ballsPerOver;
  return rest === 0 && opts?.alwaysShowBalls !== true ? String(whole) : `${whole}.${rest}`;
}

function formatRate(value: number | null): string {
  return value === null ? '–' : value.toFixed(2);
}

function formatNrr(value: number | null): string {
  if (value === null) {
    return '–';
  }
  const fixed = Math.abs(value).toFixed(3);
  if (fixed === '0.000') {
    return '0.000';
  }
  return value > 0 ? `+${fixed}` : `-${fixed}`;
}

function marginText(margin: WinMargin): string {
  if (margin.kind === 'runs') {
    return `${margin.runs} ${margin.runs === 1 ? 'run' : 'runs'}`;
  }
  const balls = margin.ballsRemaining > 0 ? ` (${margin.ballsRemaining} ${margin.ballsRemaining === 1 ? 'ball' : 'balls'} left)` : '';
  return `${margin.wickets} ${margin.wickets === 1 ? 'wicket' : 'wickets'}${balls}`;
}

function formatResult(result: MatchResult, teams: readonly MatchTeam[]): string {
  const name = (id: string | null) => teams.find((team) => team.id === id)?.name ?? 'Unknown';
  switch (result.type) {
    case 'win':
      return `${name(result.winnerTeamId)} won by ${marginText(result.margin)}`;
    case 'tie':
      return result.decider === null ? 'Match tied' : `Match tied — ${name(result.decider.winnerTeamId)} won the Super Over`;
    case 'no_result':
      return 'No result';
    case 'abandoned':
      return 'Match abandoned';
    case 'walkover':
      return `${name(result.winnerTeamId)} won by walkover`;
    case 'awarded':
      return result.winnerTeamId === null ? 'Match awarded' : `Match awarded to ${name(result.winnerTeamId)}`;
    default:
      return '';
  }
}

function implemented(probe: () => unknown): boolean {
  try {
    probe();
    return true;
  } catch (error) {
    return !(error instanceof Error && error.message === 'not implemented');
  }
}

export function formatModule(actual: FormatModule): FormatModule {
  if (implemented(() => actual.formatOvers(7, 6))) {
    return actual;
  }
  return {
    ...actual,
    formatOvers,
    formatScore: (runs, wickets) => `${runs}/${wickets}`,
    formatRate,
    formatNrr,
    formatBowlingFigures: (row, ballsPerOver) => `${formatOvers(row.legalBalls, ballsPerOver)}-${row.maidens}-${row.runsConceded}-${row.wickets}`,
  };
}

export function resultModule(actual: ResultModule): ResultModule {
  if (implemented(() => actual.formatResult({ type: 'no_result', reason: null }, []))) {
    return actual;
  }
  return { ...actual, formatResult };
}

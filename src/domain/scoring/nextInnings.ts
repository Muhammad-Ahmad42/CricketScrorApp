import type { BallCount, InningsKind, MatchSetup, MatchState, Runs, TeamId } from '../types';
import { formatOvers } from './format';
import { phaseOfIndex } from './internal/phase';
import { teamName } from './internal/squad';

export interface NextInningsPreview {
  readonly inningsIndex: number;
  readonly kind: InningsKind;
  readonly battingTeamId: TeamId | null;
  readonly target: Runs | null;
  readonly targetRevised: boolean;
  readonly maxBalls: BallCount;
  readonly startingRuns: Runs;
  readonly runsRequired: Runs | null;
  readonly text: string | null;
  readonly headline?: string | null;
  readonly detail?: string | null;
}

function runsWord(count: number): string {
  return `${count} ${count === 1 ? 'run' : 'runs'}`;
}

function oversWord(balls: BallCount, ballsPerOver: number): string {
  const overs = formatOvers(balls, ballsPerOver);
  return `${overs} ${balls === ballsPerOver ? 'over' : 'overs'}`;
}

export function nextInningsPreview(setup: MatchSetup, state: MatchState): NextInningsPreview | null {
  const pending = state.pendingAction;
  if (pending === null || pending.type !== 'start_next_innings') {
    return null;
  }
  const index = pending.inningsIndex;
  const kind = pending.kind;
  const bpo = setup.rules.ballsPerOver;
  const planned = state.plannedRevisions.find((entry) => entry.inningsIndex === index)?.revision ?? null;
  const defaultBalls = (kind === 'super_over' ? setup.rules.superOver.overs : setup.rules.oversPerInnings) * bpo;
  const maxBalls = planned?.maxBalls ?? defaultBalls;
  const partner = index % 2 === 1 ? state.innings[index - 1] : undefined;
  const revisedTarget = planned?.target ?? null;
  const target = revisedTarget ?? (partner === undefined ? null : partner.runs + 1);
  const battingTeamId = pending.suggestedBattingTeamId;
  const phase = phaseOfIndex(index);
  const startingRuns =
    battingTeamId === null
      ? 0
      : state.carriedPenalties
          .filter((entry) => entry.teamId === battingTeamId && phaseOfIndex(entry.inningsIndex) === phase)
          .reduce((sum, entry) => sum + entry.runs, 0);
  const runsRequired = target === null ? null : Math.max(0, target - startingRuns);
  const team = battingTeamId === null ? null : teamName(setup, battingTeamId);
  const chasing = team === null ? 'The chasing side' : team;
  const text =
    target === null || runsRequired === null
      ? null
      : `${chasing} need ${runsWord(runsRequired)} to win from ${oversWord(maxBalls, bpo)} (target ${target}${revisedTarget !== null ? ', revised' : ''}).`;
  const headline = target === null ? null : `Target ${target}${revisedTarget !== null ? ' (revised)' : ''}`;
  const detail = runsRequired === null ? null : `${chasing} need ${runsWord(runsRequired)} from ${oversWord(maxBalls, bpo)}.`;
  return {
    inningsIndex: index,
    kind,
    battingTeamId,
    target,
    targetRevised: revisedTarget !== null,
    maxBalls,
    startingRuns,
    runsRequired,
    text,
    headline,
    detail,
  };
}

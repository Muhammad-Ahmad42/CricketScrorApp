import type {
  BallCount,
  BowlerQuotaMode,
  BowlerSelectionReason,
  CreaseEnd,
  CreasePosition,
  DeliveryDismissalType,
  EventValidationCode,
  MatchEndOutcome,
  MatchEventInput,
  MatchSetup,
  MatchState,
  OffBallDismissalType,
  PlayerId,
  PowerplayRule,
  RetirementKind,
  RunsTo,
  SuspensionReason,
  TeamId,
} from '../types';
import { intentPlan } from './internal/plans';
import { validateEventCore } from './internal/validation';
import { applyEvent } from './replay';

export type ScoringIntent =
  | { readonly type: 'runs'; readonly runsRun: number; readonly boundary?: 0 | 4 | 6; readonly shortRuns?: number }
  | { readonly type: 'wide'; readonly runsRun?: number; readonly boundary?: boolean; readonly shortRuns?: number }
  | {
      readonly type: 'no_ball';
      readonly runsTo?: RunsTo;
      readonly runsRun?: number;
      readonly boundary?: 0 | 4 | 6;
      readonly shortRuns?: number;
    }
  | { readonly type: 'bye'; readonly runsRun: number; readonly boundary?: boolean; readonly shortRuns?: number }
  | { readonly type: 'leg_bye'; readonly runsRun: number; readonly boundary?: boolean; readonly shortRuns?: number }
  | {
      readonly type: 'wicket';
      readonly dismissal: DeliveryDismissalType;
      readonly playerOutId?: PlayerId;
      readonly fielderIds?: readonly PlayerId[];
      readonly dismissalEnd?: CreaseEnd;
      readonly call?: 'fair' | 'wide' | 'no_ball';
      readonly runsTo?: RunsTo;
      readonly runsRun?: number;
      readonly nextBatterId?: PlayerId | null;
    }
  | { readonly type: 'swap_strike' }
  | { readonly type: 'select_bowler'; readonly bowlerId: PlayerId; readonly reason?: BowlerSelectionReason }
  | { readonly type: 'batter_in'; readonly playerId: PlayerId; readonly position?: CreasePosition }
  | { readonly type: 'retire'; readonly playerId: PlayerId; readonly retirement: RetirementKind; readonly nextBatterId?: PlayerId | null }
  | {
      readonly type: 'off_ball_dismissal';
      readonly playerId: PlayerId;
      readonly dismissal: OffBallDismissalType;
      readonly fielderIds?: readonly PlayerId[];
      readonly nextBatterId?: PlayerId | null;
    }
  | {
      readonly type: 'start_innings';
      readonly strikerId: PlayerId;
      readonly nonStrikerId: PlayerId;
      readonly bowlerId: PlayerId;
      readonly battingTeamId?: TeamId;
    }
  | {
      readonly type: 'revise_overs';
      readonly inningsIndex: number;
      readonly overs?: number;
      readonly balls?: BallCount;
      readonly target?: number | null;
      readonly maxOversPerBowler?: number | null;
      readonly bowlerQuotaMode?: BowlerQuotaMode;
      readonly powerplays?: readonly PowerplayRule[];
      readonly scope?: 'this_innings' | 'both_innings';
      readonly terminal?: boolean;
      readonly reason: string;
    }
  | { readonly type: 'penalty'; readonly teamId: TeamId; readonly runs: number; readonly reason: string; readonly inningsIndex?: number }
  | { readonly type: 'suspend_play'; readonly reason: SuspensionReason; readonly note?: string | null }
  | { readonly type: 'resume_play' }
  | {
      readonly type: 'end_innings';
      readonly reason: 'declared' | 'batters_unavailable';
      readonly absentees?: readonly { readonly playerId: PlayerId; readonly hurt: boolean }[];
    }
  | { readonly type: 'start_super_over' }
  | { readonly type: 'end_match'; readonly outcome: MatchEndOutcome };

export type ScoringIntentType = ScoringIntent['type'];

export type CommandResult =
  | { readonly ok: true; readonly events: readonly MatchEventInput[] }
  | { readonly ok: false; readonly code: EventValidationCode; readonly message: string };

export function buildEvents(setup: MatchSetup, state: MatchState, intent: ScoringIntent): CommandResult {
  const plan = intentPlan(setup, state, intent);
  if (!plan.ok) {
    return plan;
  }
  const events: MatchEventInput[] = [];
  let scratch = state;
  for (const step of plan.steps) {
    const payload = typeof step === 'function' ? step(scratch) : step;
    if (payload === null) {
      continue;
    }
    const validation = validateEventCore(setup, scratch, payload, 'append');
    if (!validation.ok) {
      return { ok: false, code: validation.code, message: validation.message };
    }
    events.push(payload);
    const seq = scratch.lastSeq + 1;
    scratch = applyEvent(setup, scratch, { ...payload, id: `pending-${seq}`, matchId: setup.matchId, seq, actionId: 'pending', recordedAt: '' });
  }
  return { ok: true, events };
}

export function scoreRuns(runs: number, opts?: { readonly allRun?: boolean; readonly shortRuns?: number }): ScoringIntent {
  const short = opts?.shortRuns === undefined ? {} : { shortRuns: opts.shortRuns };
  if ((runs === 4 || runs === 6) && opts?.allRun !== true) {
    return { type: 'runs', runsRun: 0, boundary: runs, ...short };
  }
  return { type: 'runs', runsRun: runs, ...short };
}

export function overthrowBoundary(
  runsRun: number,
  opts?: { readonly runsTo?: RunsTo; readonly call?: 'fair' | 'no_ball' },
): ScoringIntent {
  const runsTo = opts?.runsTo ?? 'bat';
  if (opts?.call === 'no_ball') {
    return { type: 'no_ball', runsTo, runsRun, boundary: 4 };
  }
  if (runsTo === 'bat') {
    return { type: 'runs', runsRun, boundary: 4 };
  }
  return { type: runsTo, runsRun, boundary: true };
}

export function wide(runsRun?: number, opts?: { readonly boundary?: boolean; readonly shortRuns?: number }): ScoringIntent {
  return {
    type: 'wide',
    runsRun: runsRun ?? 0,
    ...(opts?.boundary === undefined ? {} : { boundary: opts.boundary }),
    ...(opts?.shortRuns === undefined ? {} : { shortRuns: opts.shortRuns }),
  };
}

export function noBall(spec?: {
  readonly runsTo?: RunsTo;
  readonly runsRun?: number;
  readonly boundary?: 0 | 4 | 6;
  readonly shortRuns?: number;
}): ScoringIntent {
  return { type: 'no_ball', ...spec };
}

export function bye(runsRun: number, opts?: { readonly boundary?: boolean; readonly shortRuns?: number }): ScoringIntent {
  return { type: 'bye', runsRun, ...opts };
}

export function legBye(runsRun: number, opts?: { readonly boundary?: boolean; readonly shortRuns?: number }): ScoringIntent {
  return { type: 'leg_bye', runsRun, ...opts };
}

export function wicket(spec: Omit<Extract<ScoringIntent, { readonly type: 'wicket' }>, 'type'>): ScoringIntent {
  return { type: 'wicket', ...spec };
}

export function swapStrike(): ScoringIntent {
  return { type: 'swap_strike' };
}

export function selectBowler(bowlerId: PlayerId, reason?: BowlerSelectionReason): ScoringIntent {
  return reason === undefined ? { type: 'select_bowler', bowlerId } : { type: 'select_bowler', bowlerId, reason };
}

export function batterIn(playerId: PlayerId, position?: CreasePosition): ScoringIntent {
  return position === undefined ? { type: 'batter_in', playerId } : { type: 'batter_in', playerId, position };
}

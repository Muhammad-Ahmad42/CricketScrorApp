import type {
  BowlerIneligibility,
  DeliveryDismissalType,
  InningsCompletionReason,
  InningsState,
  OffBallDismissalType,
  RetirementKind,
  SuspensionReason,
  TieDecisionMethod,
} from '@/domain/types';
import { ordinal } from './names';

export const COMPLETION_TEXT: { readonly [K in InningsCompletionReason]: string } = {
  all_out: 'all out',
  overs_complete: 'overs completed',
  target_reached: 'target reached',
  declared: 'declared',
  batters_unavailable: 'no batters available',
  match_ended: 'match ended',
  terminated: 'play ended',
};

export const SUSPENSION_TEXT: { readonly [K in SuspensionReason]: string } = {
  rain: 'Rain',
  bad_light: 'Bad light',
  wet_outfield: 'Wet outfield',
  interval: 'Interval',
  injury: 'Injury',
  other: 'Other',
};

export const SUSPENSION_REASONS: readonly SuspensionReason[] = ['rain', 'bad_light', 'wet_outfield', 'interval', 'injury', 'other'];

export const DISMISSAL_LABEL: { readonly [K in DeliveryDismissalType]: string } = {
  bowled: 'Bowled',
  caught: 'Caught',
  lbw: 'LBW',
  run_out: 'Run out',
  stumped: 'Stumped',
  hit_wicket: 'Hit wicket',
  hit_ball_twice: 'Hit the ball twice',
  obstructing_field: 'Obstructing the field',
  handled_ball: 'Handled the ball',
};

export const MAIN_DISMISSALS: readonly DeliveryDismissalType[] = ['bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket'];
export const RARE_DISMISSALS: readonly DeliveryDismissalType[] = ['hit_ball_twice', 'obstructing_field', 'handled_ball'];

export const OFF_BALL_LABEL: { readonly [K in OffBallDismissalType]: string } = {
  run_out: 'Run out (no ball bowled)',
  obstructing_field: 'Obstructing the field',
  timed_out: 'Timed out',
};

export const RETIREMENT_LABEL: { readonly [K in RetirementKind]: string } = {
  retired_hurt: 'Retired hurt',
  retired_not_out: 'Retired not out',
  retired_out: 'Retired out',
};

export const TIE_METHOD_LABEL: { readonly [K in Exclude<TieDecisionMethod, 'super_over'>]: string } = {
  boundary_count: 'Boundary count',
  bowl_out: 'Bowl-out',
  coin_toss: 'Coin toss',
  organizer: 'Organizer decision',
};

export function ineligibilityText(reason: BowlerIneligibility, maxOvers: number | null): string {
  switch (reason) {
    case 'bowled_previous_over':
      return 'Bowled the last over';
    case 'quota_reached':
      return maxOvers === null ? 'Reached the over limit' : `Reached ${maxOvers} ${maxOvers === 1 ? 'over' : 'overs'}`;
    case 'replaced_this_over':
      return 'Replaced during this over';
    case 'removed_from_attack':
      return 'Removed from the attack';
    case 'bowled_previous_super_over':
      return 'Bowled the previous super over';
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

export function inningsTitle(innings: Pick<InningsState, 'kind' | 'superOverRound' | 'index'>, regularNumber: number): string {
  if (innings.kind === 'super_over') {
    return `Super over ${innings.superOverRound ?? 1}`;
  }
  return `${ordinal(regularNumber)} innings`;
}

export function regularNumberOf(innings: readonly Pick<InningsState, 'kind' | 'index'>[], index: number): number {
  return innings.filter((entry) => entry.kind === 'regular' && entry.index <= index).length;
}

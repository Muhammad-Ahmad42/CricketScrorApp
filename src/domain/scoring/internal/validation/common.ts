import type {
  EventValidationCode,
  InningsState,
  MatchEventInput,
  MatchSetup,
  MatchState,
  PlayerId,
  TeamId,
  ValidationResult,
  ValidationWarning,
} from '../../../types';
import { inProgressInnings } from '../eligibility';
import { checkSquadMember, playerName, teamName } from '../squad';

export function pass(warnings: readonly ValidationWarning[] = []): ValidationResult {
  return { ok: true, warnings };
}

export function fail(code: EventValidationCode, message: string): ValidationResult {
  return { ok: false, code, message };
}

export const UNREADABLE_MESSAGE = 'This entry could not be read. It may be damaged or from a newer version of Scorebook.';

const PAUSED_KINDS: readonly MatchEventInput['kind'][] = ['play_resumed', 'overs_revised', 'penalty_awarded', 'match_ended'];

function allowedBeforeStart(event: MatchEventInput): boolean {
  if (event.kind === 'innings_started' || event.kind === 'overs_revised') {
    return true;
  }
  if (event.kind === 'match_ended') {
    const type = event.outcome.type;
    return type === 'abandoned' || type === 'walkover' || type === 'awarded';
  }
  return false;
}

export function lifecycleGate(state: MatchState, event: MatchEventInput): ValidationResult | null {
  if (state.result !== null || state.lifecycle === 'completed' || state.lifecycle === 'abandoned') {
    return fail('MATCH_ALREADY_ENDED', 'This match has already ended. Undo the result first if it needs to change.');
  }
  if (state.innings.length === 0 && !allowedBeforeStart(event)) {
    return fail('MATCH_NOT_STARTED', 'The match has not started yet. Start the first innings first.');
  }
  if (state.lifecycle === 'paused' && !PAUSED_KINDS.includes(event.kind)) {
    return fail('PLAY_SUSPENDED', 'Play is suspended. Resume play before recording this.');
  }
  return null;
}

export function requireInningsInProgress(state: MatchState): InningsState | ValidationResult {
  const innings = inProgressInnings(state);
  if (innings === null) {
    return fail('INNINGS_NOT_IN_PROGRESS', 'No innings is in progress. Start the next innings first.');
  }
  return innings;
}

export function isValidationResult(value: InningsState | ValidationResult): value is ValidationResult {
  return 'ok' in value;
}

export function squadFailure(
  setup: MatchSetup,
  teamId: TeamId,
  playerId: PlayerId,
  role: string,
  allowSubstitute = false,
): ValidationResult | null {
  const check = checkSquadMember(setup, teamId, playerId, allowSubstitute);
  switch (check) {
    case 'ok':
      return null;
    case 'not_in_squad':
      return fail('PLAYER_NOT_IN_SQUAD', `That ${role} is not in this match's squad. Add the player to the squad first.`);
    case 'wrong_side':
      return fail('PLAYER_WRONG_SIDE', `${playerName(setup, playerId)} doesn't play for ${teamName(setup, teamId)} in this match.`);
    case 'substitute':
      return fail('SUBSTITUTE_NOT_ALLOWED', `${playerName(setup, playerId)} is a substitute fielder and can't ${role === 'bowler' ? 'bowl' : 'bat'}.`);
    default: {
      const unreachable: never = check;
      return unreachable;
    }
  }
}

export function pendingMessage(state: MatchState): string {
  const pending = state.pendingAction;
  if (pending === null) {
    return 'Finish the current step before recording the next ball.';
  }
  switch (pending.type) {
    case 'select_next_batter':
      return 'Choose the next batter before recording the next ball.';
    case 'select_next_bowler':
      return 'Choose the bowler for the next over before recording the next ball.';
    case 'start_next_innings':
      return 'This innings is over. Start the next innings first.';
    case 'confirm_result':
      return 'The match result has been reached. Confirm the result or undo the last ball.';
    case 'resolve_tie':
      return 'The match is tied. Choose a super over or decide the tie first.';
    case 'resume_play':
      return 'Play is suspended. Resume play before recording this.';
    default: {
      const unreachable: never = pending;
      return unreachable;
    }
  }
}

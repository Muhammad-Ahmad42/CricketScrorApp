import type {
  EventValidationCode,
  InningsState,
  MatchEvent,
  MatchSetup,
  MatchState,
  MatchStatus,
  ReplayIssue,
} from '../types';
import { applyDelivery } from './internal/apply/delivery';
import { applyBatterDismissed, applyBatterIn, applyBatterRetired, applyStrikeSwapped } from './internal/apply/crease';
import { applyInningsEnded, applyInningsStarted, applySuperOverStarted } from './internal/apply/innings';
import { applyMatchEnded, applyOversRevised, applyPenalty, applyPlayResumed, applyPlaySuspended } from './internal/apply/organizer';
import { appended, thawInnings, thawState, type StateDraft } from './internal/draft';
import { inProgressInnings, latestInnings } from './internal/eligibility';
import { deriveDraft, finalizeDraft } from './internal/finalize';
import { isRecord, isString } from './internal/guards';
import { putInnings, setBowler } from './internal/innings';
import { stampsMatch } from './internal/stamps';
import { validateEventCore } from './internal/validation';
import { UNREADABLE_MESSAGE } from './internal/validation/common';

export function initialMatchState(setup: MatchSetup): MatchState {
  const state: StateDraft = {
    matchId: setup.matchId,
    lifecycle: 'not_started',
    innings: [],
    currentInningsIndex: null,
    superOverRound: null,
    chase: null,
    currentRunRate: null,
    pendingAction: null,
    canRecordDelivery: false,
    retirementsDue: [],
    naturalResult: null,
    result: null,
    resultText: null,
    suspension: null,
    plannedRevisions: [],
    carriedPenalties: [],
    lastSeq: 0,
    lastAppliedSeq: 0,
    issues: [],
    needsRepair: false,
  };
  deriveDraft(setup, state);
  return state;
}

function applyBowlerSelected(state: StateDraft, event: Extract<MatchEvent, { readonly kind: 'bowler_selected' }>): void {
  const current = inProgressInnings(state);
  if (current === null) {
    return;
  }
  const innings = thawInnings(current);
  const outgoing = current.bowlerId;
  if (current.currentOver !== null && event.reason === 'suspended' && outgoing !== null && !current.removedBowlerIds.includes(outgoing)) {
    innings.removedBowlerIds = appended(current.removedBowlerIds, outgoing);
  }
  setBowler(innings, event.bowlerId);
  putInnings(state, innings);
}

function applyPayload(setup: MatchSetup, state: StateDraft, event: MatchEvent): void {
  switch (event.kind) {
    case 'innings_started':
      return applyInningsStarted(setup, state, event);
    case 'delivery':
      return applyDelivery(setup, state, event);
    case 'batter_in':
      return applyBatterIn(setup, state, event);
    case 'bowler_selected':
      return applyBowlerSelected(state, event);
    case 'strike_swapped':
      return applyStrikeSwapped(state);
    case 'batter_retired':
      return applyBatterRetired(setup, state, event);
    case 'batter_dismissed':
      return applyBatterDismissed(setup, state, event);
    case 'penalty_awarded':
      return applyPenalty(state, event);
    case 'overs_revised':
      return applyOversRevised(setup, state, event);
    case 'play_suspended':
      return applyPlaySuspended(state, event);
    case 'play_resumed':
      return applyPlayResumed(state);
    case 'innings_ended':
      return applyInningsEnded(state, event);
    case 'super_over_started':
      return applySuperOverStarted(state, event);
    case 'match_ended':
      return applyMatchEnded(setup, state, event);
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

function skip(setup: MatchSetup, state: MatchState, seq: number | null, eventId: string, code: EventValidationCode, message: string): MatchState {
  const draft = thawState(state);
  const issue: ReplayIssue = { seq: seq ?? state.lastSeq, eventId, severity: 'error', code, message };
  draft.issues = appended(state.issues, issue);
  draft.lastSeq = seq ?? state.lastSeq;
  deriveDraft(setup, draft);
  return draft;
}

function envelopeReadable(event: MatchEvent): boolean {
  return isString(event.id) && isString(event.actionId) && isString(event.recordedAt);
}

function withDerivedStamps(event: MatchEvent, innings: InningsState | null): MatchEvent {
  if (event.kind !== 'delivery' || innings === null || stampsMatch(innings, event)) {
    return event;
  }
  return {
    ...event,
    strikerId: innings.strikerId ?? event.strikerId,
    nonStrikerId: innings.nonStrikerId,
    bowlerId: innings.bowlerId ?? event.bowlerId,
  };
}

export function applyEvent(setup: MatchSetup, state: MatchState, event: MatchEvent): MatchState {
  const record: unknown = event;
  if (!isRecord(record)) {
    return skip(setup, state, null, '', 'UNKNOWN_EVENT_KIND', UNREADABLE_MESSAGE);
  }
  const rawSeq = record.seq;
  const seq = typeof rawSeq === 'number' && Number.isSafeInteger(rawSeq) ? rawSeq : null;
  const eventId = isString(record.id) ? record.id : '';
  if (seq === null || seq !== state.lastSeq + 1) {
    return skip(setup, state, seq, eventId, 'SEQ_OUT_OF_ORDER', 'This entry is out of order in the match log.');
  }
  if (!envelopeReadable(event)) {
    return skip(setup, state, seq, eventId, 'UNKNOWN_EVENT_KIND', UNREADABLE_MESSAGE);
  }
  const validation = validateEventCore(setup, state, event, 'replay');
  if (!validation.ok) {
    return skip(setup, state, seq, eventId, validation.code, validation.message);
  }
  const draft = thawState(state);
  const innings = inProgressInnings(state);
  if (event.kind === 'delivery' && innings !== null && !stampsMatch(innings, event)) {
    draft.issues = appended(state.issues, {
      seq,
      eventId,
      severity: 'warning',
      code: 'CONTEXT_MISMATCH',
      message: 'The batters or bowler stored on this ball did not match the scorecard; the scorecard was used.',
    });
  }
  applyPayload(setup, draft, withDerivedStamps(event, innings));
  finalizeDraft(setup, state, draft, seq);
  draft.lastSeq = seq;
  draft.lastAppliedSeq = seq;
  return draft;
}

export function replayMatch(setup: MatchSetup, events: readonly MatchEvent[]): MatchState {
  let state = initialMatchState(setup);
  for (const event of events) {
    state = applyEvent(setup, state, event);
  }
  return state;
}

export function currentInnings(state: MatchState): InningsState | null {
  return inProgressInnings(state) ?? latestInnings(state);
}

export function deriveMatchStatus(state: MatchState, storedStatus: MatchStatus): MatchStatus {
  switch (state.lifecycle) {
    case 'not_started':
      return storedStatus;
    case 'live':
      return 'live';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'completed';
    case 'abandoned':
      return 'abandoned';
    default: {
      const unreachable: never = state.lifecycle;
      return unreachable;
    }
  }
}

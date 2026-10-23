import type {
  EventId,
  EventValidationCode,
  IdGenerator,
  InningsState,
  IsoDateTime,
  MatchEvent,
  MatchEventInput,
  MatchSetup,
  MatchState,
  Seq,
} from '../types';
import { canonicalJson, fnv1a32 } from './internal/canonical';
import { editFailure, isEditLogFailure, materialiseEdits, normaliseEdited, validateEditedLog } from './internal/editLog';
import { computeAnchors, normalizeWithAnchors } from './internal/normalize';
import { validateEventCore } from './internal/validation';
import { applyEvent, replayMatch } from './replay';

export type RedoStack = readonly (readonly MatchEvent[])[];

export interface UndoResult {
  readonly events: readonly MatchEvent[];
  readonly undone: readonly MatchEvent[];
  readonly tailId?: EventId | null;
}

export function lastActionGroup(events: readonly MatchEvent[]): readonly MatchEvent[] {
  const last = events[events.length - 1];
  if (last === undefined) {
    return [];
  }
  let start = events.length - 1;
  while (start > 0 && events[start - 1].actionId === last.actionId) {
    start -= 1;
  }
  return events.slice(start);
}

export function undoLastAction(events: readonly MatchEvent[]): UndoResult | null {
  const group = lastActionGroup(events);
  if (group.length === 0) {
    return null;
  }
  const remaining = events.slice(0, events.length - group.length);
  return { events: remaining, undone: group, tailId: remaining[remaining.length - 1]?.id ?? null };
}

export function redoAction(
  setup: MatchSetup,
  events: readonly MatchEvent[],
  group: readonly MatchEvent[],
  expectedTailId?: EventId | null,
):
  | { readonly ok: true; readonly events: readonly MatchEvent[]; readonly state: MatchState }
  | { readonly ok: false; readonly code: EventValidationCode | 'REDO_STALE'; readonly message: string } {
  const last = events[events.length - 1];
  const tail = last?.seq ?? 0;
  const contiguous = group.every((event, index) => event.seq === tail + 1 + index);
  const anchored = expectedTailId === undefined || (last?.id ?? null) === expectedTailId;
  if (group.length === 0 || !contiguous || !anchored) {
    return { ok: false, code: 'REDO_STALE', message: "Can't redo. The match changed since this was undone." };
  }
  let state = replayMatch(setup, events);
  for (const event of group) {
    const validation = validateEventCore(setup, state, event, 'append');
    if (!validation.ok) {
      return { ok: false, code: validation.code, message: validation.message };
    }
    state = applyEvent(setup, state, event);
  }
  return { ok: true, events: [...events, ...group], state };
}

export type HistoryEditOp =
  | { readonly op: 'replace'; readonly seq: Seq; readonly with: readonly MatchEventInput[] }
  | { readonly op: 'insert_before'; readonly seq: Seq; readonly events: readonly MatchEventInput[] }
  | { readonly op: 'insert_after'; readonly seq: Seq; readonly events: readonly MatchEventInput[] }
  | { readonly op: 'delete'; readonly seq: Seq };

export interface EditContext {
  readonly ids: IdGenerator;
  readonly now: IsoDateTime;
}

export interface EditDiff {
  readonly insertedIds: readonly EventId[];
  readonly removedIds: readonly EventId[];
  readonly replacedIds: readonly EventId[];
  readonly reanchoredIds: readonly EventId[];
  readonly restampedIds: readonly EventId[];
}

export type EditOutcome =
  | {
      readonly ok: true;
      readonly events: readonly MatchEvent[];
      readonly before: MatchState;
      readonly after: MatchState;
      readonly diff: EditDiff;
      readonly affectedInnings: readonly number[];
      readonly resultChanged: boolean;
    }
  | {
      readonly ok: false;
      readonly code: EventValidationCode;
      readonly message: string;
      readonly atSeq: Seq | null;
      readonly eventId?: EventId | null;
    };

function inningsProjection(innings: InningsState | undefined): string {
  if (innings === undefined) {
    return '';
  }
  return canonicalJson({
    status: innings.status,
    completion: innings.completion?.reason ?? null,
    runs: innings.runs,
    wickets: innings.wickets,
    legalBalls: innings.legalBalls,
    extras: innings.extras,
    target: innings.target,
    limits: innings.limits,
    batting: innings.batting.map((row) => [row.playerId, row.status, row.position, row.runs, row.balls, row.fours, row.sixes, row.dismissalText]),
    bowling: innings.bowling.map((row) => [row.playerId, row.legalBalls, row.maidens, row.runsConceded, row.wickets]),
  });
}

function affectedInningsOf(before: MatchState, after: MatchState): readonly number[] {
  const count = Math.max(before.innings.length, after.innings.length);
  const affected: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (inningsProjection(before.innings[index]) !== inningsProjection(after.innings[index])) {
      affected.push(index);
    }
  }
  return affected;
}

function outcomeKey(state: MatchState): string {
  return canonicalJson(state.result ?? state.naturalResult);
}

export function applyHistoryEdits(
  setup: MatchSetup,
  events: readonly MatchEvent[],
  ops: readonly HistoryEditOp[],
  ctx: EditContext,
): EditOutcome {
  const edited = materialiseEdits(setup, events, ops, ctx);
  if (isEditLogFailure(edited)) {
    return edited;
  }
  const normalised = normaliseEdited(setup, events, edited.events, ctx);
  if (normalised.missingBowlerAtSeq !== null) {
    const missing = normalised.events.find((event) => event.seq === normalised.missingBowlerAtSeq) ?? null;
    return editFailure(
      'BOWLER_NOT_SELECTED',
      'An over has no bowler. Choose the bowler for that over.',
      normalised.missingBowlerAtSeq,
      missing?.id ?? null,
    );
  }
  const validated = validateEditedLog(setup, normalised.events);
  if (isEditLogFailure(validated)) {
    return validated;
  }
  const before = replayMatch(setup, events);
  const after = validated.state;
  return {
    ok: true,
    events: normalised.events,
    before,
    after,
    diff: {
      insertedIds: edited.insertedIds,
      removedIds: [...edited.removedIds, ...normalised.droppedIds],
      replacedIds: edited.replacedIds,
      reanchoredIds: normalised.reanchoredIds,
      restampedIds: normalised.restampedIds,
    },
    affectedInnings: affectedInningsOf(before, after),
    resultChanged: outcomeKey(before) !== outcomeKey(after),
  };
}

export function editEvent(
  setup: MatchSetup,
  events: readonly MatchEvent[],
  seq: Seq,
  replacement: readonly MatchEventInput[],
  ctx: EditContext,
): EditOutcome {
  return applyHistoryEdits(setup, events, [{ op: 'replace', seq, with: replacement }], ctx);
}

export function normalizeLog(
  setup: MatchSetup,
  events: readonly MatchEvent[],
): { readonly events: readonly MatchEvent[]; readonly reanchoredIds: readonly EventId[]; readonly restampedIds: readonly EventId[] } {
  const normalised = normalizeWithAnchors(setup, events, computeAnchors(setup, events), (actionId, run) => `${actionId}~${run}`);
  return { events: normalised.events, reanchoredIds: normalised.reanchoredIds, restampedIds: normalised.restampedIds };
}

export function logFingerprint(events: readonly MatchEvent[]): string {
  return fnv1a32(canonicalJson(events));
}

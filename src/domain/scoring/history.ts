import type {
  ActionId,
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
import { computeAnchors, normalizeWithAnchors } from './internal/normalize';
import { validateEventCore } from './internal/validation';
import { applyEvent, initialMatchState, replayMatch } from './replay';

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
    return { ok: false, code: 'REDO_STALE', message: 'The match has changed since this was undone, so it can no longer be redone.' };
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
  | { readonly ok: false; readonly code: EventValidationCode; readonly message: string; readonly atSeq: Seq | null };

interface Slot {
  readonly original: MatchEvent;
  before: MatchEvent[];
  self: MatchEvent[];
  after: MatchEvent[];
  touched: boolean;
}

type EditFailure = Extract<EditOutcome, { readonly ok: false }>;

function editFailure(code: EventValidationCode, message: string, atSeq: Seq | null): EditFailure {
  return { ok: false, code, message, atSeq };
}

interface Materialised {
  readonly events: readonly MatchEvent[];
  readonly insertedIds: readonly EventId[];
  readonly removedIds: readonly EventId[];
  readonly replacedIds: readonly EventId[];
}

function materialise(setup: MatchSetup, events: readonly MatchEvent[], ops: readonly HistoryEditOp[], ctx: EditContext): Materialised | EditFailure {
  const slots: Slot[] = events.map((event) => ({ original: event, before: [], self: [event], after: [], touched: false }));
  const bySeq = new Map<Seq, Slot>();
  for (const slot of slots) {
    if (!bySeq.has(slot.original.seq)) {
      bySeq.set(slot.original.seq, slot);
    }
  }
  const insertedIds: EventId[] = [];
  const removedIds: EventId[] = [];
  const replacedIds: EventId[] = [];
  const fresh = (payloads: readonly MatchEventInput[]): MatchEvent[] => {
    const actionId: ActionId = ctx.ids();
    return payloads.map((payload) => {
      const id = ctx.ids();
      insertedIds.push(id);
      return { ...payload, id, matchId: setup.matchId, seq: 0, actionId, recordedAt: ctx.now };
    });
  };
  for (const op of ops) {
    const slot = bySeq.get(op.seq);
    if (slot === undefined) {
      return editFailure('SEQ_OUT_OF_ORDER', 'That entry is not in the match log.', op.seq);
    }
    switch (op.op) {
      case 'replace':
      case 'delete':
        if (slot.touched) {
          return editFailure('SEQ_OUT_OF_ORDER', 'That entry was already changed in this edit.', op.seq);
        }
        slot.touched = true;
        if (op.op === 'replace') {
          replacedIds.push(slot.original.id);
          slot.self = fresh(op.with);
        } else {
          removedIds.push(slot.original.id);
          slot.self = [];
        }
        break;
      case 'insert_before':
        slot.before = [...slot.before, ...fresh(op.events)];
        break;
      case 'insert_after':
        slot.after = [...slot.after, ...fresh(op.events)];
        break;
      default: {
        const unreachable: never = op;
        return unreachable;
      }
    }
  }
  return { events: slots.flatMap((slot) => [...slot.before, ...slot.self, ...slot.after]), insertedIds, removedIds, replacedIds };
}

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

function validateNormalised(setup: MatchSetup, events: readonly MatchEvent[]): { readonly state: MatchState } | EditFailure {
  let state = initialMatchState(setup);
  for (const event of events) {
    const validation = validateEventCore(setup, state, event, 'append');
    if (!validation.ok) {
      return editFailure(validation.code, validation.message, event.seq);
    }
    state = applyEvent(setup, state, event);
  }
  if (state.issues.length > 0) {
    const issue = state.issues[0];
    return editFailure(issue.code, issue.message, issue.seq);
  }
  return { state };
}

export function applyHistoryEdits(
  setup: MatchSetup,
  events: readonly MatchEvent[],
  ops: readonly HistoryEditOp[],
  ctx: EditContext,
): EditOutcome {
  const edited = materialise(setup, events, ops, ctx);
  if ('ok' in edited) {
    return edited;
  }
  const normalised = normalizeWithAnchors(setup, edited.events, computeAnchors(setup, events), () => ctx.ids());
  if (normalised.missingBowlerAtSeq !== null) {
    return editFailure('BOWLER_NOT_SELECTED', 'An over in the edited log has no bowler. Choose the bowler for that over.', normalised.missingBowlerAtSeq);
  }
  const validated = validateNormalised(setup, normalised.events);
  if ('ok' in validated) {
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

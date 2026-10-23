import type { ActionId, EventId, EventValidationCode, MatchEvent, MatchEventInput, MatchSetup, MatchState, Seq } from '../../types';
import type { EditContext, HistoryEditOp } from '../history';
import { applyEvent, initialMatchState } from '../replay';
import { computeAnchors, normalizeWithAnchors, type NormalizeResult } from './normalize';
import { validateEventCore } from './validation';

export interface EditLogFailure {
  readonly ok: false;
  readonly code: EventValidationCode;
  readonly message: string;
  readonly atSeq: Seq | null;
  readonly eventId?: EventId | null;
}

export function editFailure(code: EventValidationCode, message: string, atSeq: Seq | null, eventId: EventId | null = null): EditLogFailure {
  return { ok: false, code, message, atSeq, eventId };
}

interface Slot {
  readonly original: MatchEvent;
  before: MatchEvent[];
  self: MatchEvent[];
  after: MatchEvent[];
  touched: boolean;
}

export interface Materialised {
  readonly events: readonly MatchEvent[];
  readonly insertedIds: readonly EventId[];
  readonly removedIds: readonly EventId[];
  readonly replacedIds: readonly EventId[];
}

export function materialiseEdits(
  setup: MatchSetup,
  events: readonly MatchEvent[],
  ops: readonly HistoryEditOp[],
  ctx: EditContext,
): Materialised | EditLogFailure {
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

export function isEditLogFailure(value: object): value is EditLogFailure {
  return 'ok' in value && (value as { readonly ok: unknown }).ok === false;
}

export function normaliseEdited(
  setup: MatchSetup,
  original: readonly MatchEvent[],
  edited: readonly MatchEvent[],
  ctx: EditContext,
): NormalizeResult {
  return normalizeWithAnchors(setup, edited, computeAnchors(setup, original), () => ctx.ids());
}

export function validateEditedLog(setup: MatchSetup, events: readonly MatchEvent[]): { readonly state: MatchState } | EditLogFailure {
  let state = initialMatchState(setup);
  for (const event of events) {
    const validation = validateEventCore(setup, state, event, 'append');
    if (!validation.ok) {
      return editFailure(validation.code, validation.message, event.seq, event.id);
    }
    state = applyEvent(setup, state, event);
  }
  if (state.issues.length > 0) {
    const issue = state.issues[0];
    return editFailure(issue.code, issue.message, issue.seq, issue.eventId);
  }
  return { state };
}

export function stateBeforeEvent(setup: MatchSetup, events: readonly MatchEvent[], eventId: EventId): MatchState {
  let state = initialMatchState(setup);
  for (const event of events) {
    if (event.id === eventId) {
      return state;
    }
    state = applyEvent(setup, state, event);
  }
  return state;
}

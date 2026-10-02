import type { ActionId, EventId, MatchEvent, MatchSetup, MatchState, Seq } from '../../types';
import { applyEvent, initialMatchState } from '../replay';
import { inProgressInnings } from './eligibility';

interface Anchor {
  readonly innings: number;
  readonly over: number;
}

function anchorKey(anchor: Anchor): string {
  return `${anchor.innings}:${anchor.over}`;
}

function overStartOf(setup: MatchSetup, state: MatchState): Anchor | null {
  const innings = inProgressInnings(state);
  if (innings === null || innings.currentOver !== null) {
    return null;
  }
  return { innings: innings.index, over: Math.floor(innings.legalBalls / setup.rules.ballsPerOver) };
}

export function computeAnchors(setup: MatchSetup, events: readonly MatchEvent[]): ReadonlyMap<EventId, Anchor> {
  const anchors = new Map<EventId, Anchor>();
  let state = initialMatchState(setup);
  events.forEach((event, index) => {
    const seq = index + 1;
    const position = event.kind === 'bowler_selected' && event.reason === 'over_start' ? overStartOf(setup, state) : null;
    state = applyEvent(setup, state, { ...event, seq });
    if (position !== null && state.lastAppliedSeq === seq) {
      anchors.set(event.id, position);
    }
  });
  return anchors;
}

export interface NormalizeResult {
  readonly events: readonly MatchEvent[];
  readonly state: MatchState;
  readonly reanchoredIds: readonly EventId[];
  readonly restampedIds: readonly EventId[];
  readonly droppedIds: readonly EventId[];
  readonly missingBowlerAtSeq: Seq | null;
}

function restamp(event: MatchEvent, state: MatchState): MatchEvent {
  if (event.kind !== 'delivery') {
    return event;
  }
  const innings = inProgressInnings(state);
  if (innings === null) {
    return event;
  }
  const strikerId = innings.strikerId ?? event.strikerId;
  const bowlerId = innings.bowlerId ?? event.bowlerId;
  if (strikerId === event.strikerId && innings.nonStrikerId === event.nonStrikerId && bowlerId === event.bowlerId) {
    return event;
  }
  return { ...event, strikerId, nonStrikerId: innings.nonStrikerId, bowlerId };
}

function repairActionGroups(events: readonly MatchEvent[], freshActionId: (actionId: ActionId, run: number) => ActionId): readonly MatchEvent[] {
  const closed = new Set<ActionId>();
  const runs = new Map<ActionId, number>();
  let previous: ActionId | null = null;
  let replacement: ActionId | null = null;
  return events.map((event) => {
    if (event.actionId !== previous) {
      if (previous !== null) {
        closed.add(previous);
      }
      previous = event.actionId;
      if (closed.has(event.actionId)) {
        const run = (runs.get(event.actionId) ?? 1) + 1;
        runs.set(event.actionId, run);
        replacement = freshActionId(event.actionId, run);
      } else {
        replacement = null;
      }
    }
    return replacement === null ? event : { ...event, actionId: replacement };
  });
}

export function normalizeWithAnchors(
  setup: MatchSetup,
  events: readonly MatchEvent[],
  anchors: ReadonlyMap<EventId, Anchor>,
  freshActionId: (actionId: ActionId, run: number) => ActionId,
): NormalizeResult {
  const grouped = events;
  const out: MatchEvent[] = [];
  const reanchored = new Set<EventId>();
  const restamped = new Set<EventId>();
  const consumed = new Set<number>();
  const deferred = new Map<string, MatchEvent[]>();
  let state = initialMatchState(setup);
  let missingBowlerAtSeq: Seq | null = null;

  const emit = (event: MatchEvent): void => {
    const seq = out.length + 1;
    const stamped = restamp({ ...event, seq }, state);
    if (stamped !== event && stamped.kind === 'delivery' && event.kind === 'delivery') {
      if (stamped.strikerId !== event.strikerId || stamped.nonStrikerId !== event.nonStrikerId || stamped.bowlerId !== event.bowlerId) {
        restamped.add(event.id);
      }
    }
    out.push(stamped);
    state = applyEvent(setup, state, stamped);
  };

  const pullAhead = (from: number, position: Anchor): MatchEvent[] => {
    const pulled: MatchEvent[] = [];
    for (let index = from + 1; index < grouped.length; index += 1) {
      const candidate = grouped[index];
      const anchor = anchors.get(candidate.id);
      if (!consumed.has(index) && anchor !== undefined && anchorKey(anchor) === anchorKey(position)) {
        consumed.add(index);
        reanchored.add(candidate.id);
        pulled.push(candidate);
      }
    }
    return pulled;
  };

  grouped.forEach((event, index) => {
    if (consumed.has(index)) {
      return;
    }
    const anchor = anchors.get(event.id);
    if (anchor !== undefined) {
      const position = overStartOf(setup, state);
      if (position !== null && anchorKey(position) === anchorKey(anchor)) {
        emit(event);
      } else {
        const list = deferred.get(anchorKey(anchor)) ?? [];
        deferred.set(anchorKey(anchor), [...list, event]);
        reanchored.add(event.id);
      }
      return;
    }
    if (event.kind === 'delivery') {
      const position = overStartOf(setup, state);
      if (position !== null) {
        const key = anchorKey(position);
        const waiting = deferred.get(key) ?? [];
        deferred.delete(key);
        const innings = inProgressInnings(state);
        const selections = waiting.length === 0 && innings !== null && innings.bowlerId === null ? pullAhead(index, position) : waiting;
        selections.forEach(emit);
        const after = inProgressInnings(state);
        if (after !== null && after.bowlerId === null && missingBowlerAtSeq === null) {
          missingBowlerAtSeq = out.length + 1;
        }
      }
    }
    emit(event);
  });

  const dropped: EventId[] = [];
  const tail = overStartOf(setup, state);
  for (const [key, list] of deferred) {
    if (tail !== null && key === anchorKey(tail)) {
      list.forEach(emit);
    } else {
      for (const event of list) {
        dropped.push(event.id);
        reanchored.delete(event.id);
      }
    }
  }
  return {
    events: repairActionGroups(out, freshActionId),
    state,
    reanchoredIds: [...reanchored],
    restampedIds: [...restamped],
    droppedIds: dropped,
    missingBowlerAtSeq,
  };
}

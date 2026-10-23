import type {
  DeliveryDismissalType,
  EventId,
  EventValidationCode,
  Explained,
  InningsState,
  MatchEvent,
  MatchEventInput,
  MatchSetup,
  MatchState,
  PendingActionType,
  PlayerId,
  Runs,
  Seq,
  TeamId,
} from '../types';
import { applyHistoryEdits, type EditContext, type EditOutcome, type HistoryEditOp } from './history';
import { isEditLogFailure, materialiseEdits, normaliseEdited, stateBeforeEvent } from './internal/editLog';
import { inProgressInnings, latestInnings } from './internal/eligibility';
import { playerName, teamName } from './internal/squad';
import { isStrikerOnly } from './internal/validation/delivery';
import { explain } from '../text';
import { formatOvers, formatRequirement, formatScore } from './format';
import { replayMatch } from './replay';

export type EditSuccess = Extract<EditOutcome, { readonly ok: true }>;
export type EditFailure = Extract<EditOutcome, { readonly ok: false }>;

export type EditResolutionKind = 'reopen_match' | 'confirm_new_result' | 'keep_strike' | 'dismiss_striker' | 'remove_later_play';

export interface EditResolution {
  readonly kind: EditResolutionKind;
  readonly automatic: boolean;
  readonly label: string;
  readonly description: string;
  readonly ops: readonly HistoryEditOp[];
}

export interface EditConflict {
  readonly code: EventValidationCode;
  readonly message: string;
  readonly headline?: string;
  readonly detail?: string;
  readonly reason: string;
  readonly atSeq: Seq;
  readonly eventId: EventId;
  readonly inningsIndex: number | null;
  readonly ballLabel: string | null;
  readonly resolutions: readonly EditResolution[];
}

export interface EditTargetChange {
  readonly inningsIndex: number;
  readonly teamId: TeamId;
  readonly before: Runs | null;
  readonly after: Runs | null;
}

export interface EditConsequences {
  readonly reopensMatch: boolean;
  readonly resultBefore: string | null;
  readonly resultAfter: string | null;
  readonly targetChanges: readonly EditTargetChange[];
  readonly removedDeliveries: number;
  readonly lines: readonly string[];
  readonly items?: readonly Explained[];
}

export type PlannedHistoryEdit =
  | {
      readonly ok: true;
      readonly outcome: EditSuccess;
      readonly ops: readonly HistoryEditOp[];
      readonly resolutions: readonly EditResolution[];
      readonly consequences: EditConsequences;
    }
  | { readonly ok: false; readonly failure: EditFailure; readonly conflict: EditConflict | null };

const AUTOMATIC_ROUNDS = 4;
const TRIM_ROUNDS = 4;
const TERMINAL_PENDING: readonly PendingActionType[] = ['confirm_result', 'start_next_innings', 'resolve_tie'];

interface Location {
  readonly inningsIndex: number | null;
  readonly ballLabel: string | null;
  readonly inningsName: string | null;
  readonly onBall: boolean;
}

interface Context {
  readonly setup: MatchSetup;
  readonly events: readonly MatchEvent[];
  readonly original: MatchState;
  readonly ctx: EditContext;
}

interface Diagnosis {
  readonly automatic: EditResolution | null;
  readonly conflict: EditConflict | null;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${n}th`;
  }
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function inningsName(innings: InningsState | undefined): string | null {
  if (innings === undefined) {
    return null;
  }
  if (innings.kind === 'super_over') {
    const round = innings.superOverRound ?? 1;
    return round > 1 ? `super over ${round}` : 'super over';
  }
  return `${ordinal(innings.index + 1)} innings`;
}

function isTerminal(state: MatchState): boolean {
  return state.lifecycle === 'completed' || state.lifecycle === 'abandoned';
}

function payloadOf(event: MatchEvent): MatchEventInput {
  const { id, matchId, seq, actionId, recordedAt, ...payload } = event;
  void id;
  void matchId;
  void seq;
  void actionId;
  void recordedAt;
  return payload as MatchEventInput;
}

function locate(state: MatchState, event: MatchEvent): Location {
  let found: { readonly label: string; readonly inningsIndex: number; readonly onBall: boolean } | null = null;
  for (const innings of state.innings) {
    for (const ball of innings.balls) {
      if (ball.eventId === event.id) {
        return { inningsIndex: innings.index, ballLabel: ball.label, inningsName: inningsName(innings), onBall: true };
      }
      if (ball.seq < event.seq) {
        found = { label: ball.label, inningsIndex: innings.index, onBall: false };
      }
    }
  }
  if (found === null) {
    return { inningsIndex: null, ballLabel: null, inningsName: null, onBall: false };
  }
  return { inningsIndex: found.inningsIndex, ballLabel: found.label, inningsName: inningsName(state.innings[found.inningsIndex]), onBall: false };
}

function capitalise(text: string): string {
  return text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`;
}

function shortBall(location: Location): string | null {
  return location.ballLabel === null ? null : `ball ${location.ballLabel}`;
}

function ballPhrase(location: Location): string | null {
  if (location.ballLabel === null) {
    return null;
  }
  return location.inningsName === null ? `ball ${location.ballLabel}` : `ball ${location.ballLabel} of the ${location.inningsName}`;
}

const KIND_PHRASE: { readonly [K in MatchEvent['kind']]: string } = {
  innings_started: 'start of an innings',
  delivery: 'ball',
  batter_in: "new batter's arrival",
  bowler_selected: 'bowler change',
  strike_swapped: 'strike change',
  batter_retired: 'retirement',
  batter_dismissed: 'dismissal',
  penalty_awarded: 'penalty runs',
  overs_revised: 'overs revision',
  play_suspended: 'suspension of play',
  play_resumed: 'restart of play',
  innings_ended: 'end of the innings',
  super_over_started: 'start of the super over',
  match_ended: 'recorded result',
};

function wherePhrase(event: MatchEvent, location: Location): string {
  const ball = ballPhrase(location);
  if (event.kind === 'match_ended') {
    return 'the recorded result';
  }
  if (location.onBall && ball !== null) {
    return ball;
  }
  return ball === null ? `the ${KIND_PHRASE[event.kind]}` : `the ${KIND_PHRASE[event.kind]} after ${ball}`;
}

const OUT_WORDS: { readonly [K in DeliveryDismissalType]: string } = {
  bowled: 'bowled',
  caught: 'caught',
  lbw: 'lbw',
  run_out: 'run out',
  stumped: 'stumped',
  hit_wicket: 'hit wicket',
  hit_ball_twice: 'for hitting the ball twice',
  obstructing_field: 'for obstructing the field',
  handled_ball: 'for handling the ball',
};

function normalisedLog(context: Context, ops: readonly HistoryEditOp[]): readonly MatchEvent[] | null {
  let counter = 0;
  const scratch: EditContext = {
    ids: () => {
      counter += 1;
      return `edit-scratch-${counter}`;
    },
    now: context.ctx.now,
  };
  const edited = materialiseEdits(context.setup, context.events, ops, scratch);
  if (isEditLogFailure(edited)) {
    return null;
  }
  return normaliseEdited(context.setup, context.events, edited.events, scratch).events;
}

function touchedSeqs(ops: readonly HistoryEditOp[]): ReadonlySet<Seq> {
  return new Set(ops.filter((op) => op.op === 'replace' || op.op === 'delete').map((op) => op.seq));
}

function followersOf(events: readonly MatchEvent[], event: MatchEvent): readonly MatchEvent[] {
  const index = events.findIndex((candidate) => candidate.id === event.id);
  const followers: MatchEvent[] = [];
  for (let cursor = index + 1; cursor < events.length && events[cursor].actionId === event.actionId; cursor += 1) {
    followers.push(events[cursor]);
  }
  return followers;
}

function reopenResolution(context: Context, ops: readonly HistoryEditOp[], ended: MatchEvent, pre: MatchState): EditResolution {
  const recorded = context.original.resultText;
  const natural = pre.naturalResult;
  if (natural !== null && !(natural.type === 'tie' && natural.decider === null) && ended.kind === 'match_ended' && ended.outcome.type === 'tie_decided') {
    return {
      kind: 'confirm_new_result',
      automatic: true,
      label: 'Confirm new result',
      description: recorded === null ? 'No longer a tie. The new result is confirmed.' : `No longer a tie. “${recorded}” is replaced.`,
      ops: [...ops, { op: 'replace', seq: ended.seq, with: [{ kind: 'match_ended', outcome: { type: 'natural' } }] }],
    };
  }
  return {
    kind: 'reopen_match',
    automatic: true,
    label: 'Reopen match',
    description: recorded === null ? 'The result no longer stands. The match reopens.' : `“${recorded}” no longer stands. The match reopens.`,
    ops: [...ops, { op: 'delete', seq: ended.seq }],
  };
}

function stopKinds(pending: PendingActionType): readonly MatchEvent['kind'][] {
  switch (pending) {
    case 'start_next_innings':
      return ['innings_started', 'match_ended'];
    case 'resolve_tie':
      return ['super_over_started', 'match_ended'];
    default:
      return ['match_ended'];
  }
}

function trimRange(context: Context, ops: readonly HistoryEditOp[], failing: MatchEvent, pending: PendingActionType): readonly MatchEvent[] {
  const touched = touchedSeqs(ops);
  const stops = stopKinds(pending);
  const start = context.events.findIndex((event) => event.id === failing.id);
  const removed: MatchEvent[] = [];
  for (let index = start; index < context.events.length; index += 1) {
    const event = context.events[index];
    if (index > start && stops.includes(event.kind)) {
      break;
    }
    if (!touched.has(event.seq)) {
      removed.push(event);
    }
  }
  return removed;
}

function failingEvent(context: Context, failure: EditFailure): MatchEvent | null {
  const id = failure.eventId ?? null;
  if (id === null) {
    return null;
  }
  return context.events.find((event) => event.id === id) ?? null;
}

function trimResolution(context: Context, ops: readonly HistoryEditOp[], failing: MatchEvent, pre: MatchState): EditResolution | null {
  let current = ops;
  let target = failing;
  let pending = pre.pendingAction?.type ?? null;
  const removed: MatchEvent[] = [];
  for (let round = 0; round < TRIM_ROUNDS && pending !== null; round += 1) {
    const range = trimRange(context, current, target, pending);
    if (range.length === 0) {
      return null;
    }
    removed.push(...range);
    current = [...current, ...range.map((event): HistoryEditOp => ({ op: 'delete', seq: event.seq }))];
    const outcome = resolveAutomatically(context, current);
    if (outcome.ok) {
      const deliveries = removed.filter((event) => event.kind === 'delivery').length;
      const what = deliveries === 0 ? 'later entries are' : `${plural(deliveries, 'later ball')} ${deliveries === 1 ? 'is' : 'are'}`;
      return {
        kind: 'remove_later_play',
        automatic: false,
        label: deliveries === 0 ? 'Remove later entries' : `Remove ${plural(deliveries, 'later ball')}`,
        description: `${capitalise(endPhrase(pre))}, so ${what} removed.`,
        ops: outcome.ops,
      };
    }
    const next = failingEvent(context, outcome.failure);
    if (next === null || next.kind === 'match_ended') {
      return null;
    }
    const log = normalisedLog(context, current);
    if (log === null) {
      return null;
    }
    const state = stateBeforeEvent(context.setup, log, next.id);
    const nextPending = state.pendingAction?.type ?? null;
    if (nextPending === null || !TERMINAL_PENDING.includes(nextPending) || (nextPending === 'start_next_innings' && next.kind === 'innings_started')) {
      return null;
    }
    target = next;
    pending = nextPending;
  }
  return null;
}

function endPhrase(pre: MatchState): string {
  const finished = latestInnings(pre);
  const last = finished?.balls[finished.balls.length - 1]?.label ?? null;
  const pending = pre.pendingAction?.type ?? null;
  const ended =
    pending === 'start_next_innings'
      ? `the ${inningsName(finished ?? undefined) ?? 'innings'} ends`
      : pending === 'resolve_tie'
        ? 'the match is tied'
        : 'the match is decided';
  return last === null ? ended : `${ended} on ball ${last}`;
}

function endHeadline(pre: MatchState): string {
  const finished = latestInnings(pre);
  const last = finished?.balls[finished.balls.length - 1]?.label ?? null;
  const pending = pre.pendingAction?.type ?? null;
  const ended =
    pending === 'start_next_innings'
      ? `${capitalise(inningsName(finished ?? undefined) ?? 'innings')} now ends`
      : pending === 'resolve_tie'
        ? 'Match now tied'
        : 'Match now decided';
  return last === null ? `${ended} earlier` : `${ended} on ball ${last}`;
}

function swapPoint(context: Context, ops: readonly HistoryEditOp[]): MatchEvent | null {
  const log = normalisedLog(context, ops);
  if (log === null) {
    return null;
  }
  const byId = new Map(context.events.map((event) => [event.id, event]));
  for (const event of log) {
    if (event.kind !== 'delivery') {
      continue;
    }
    const original = byId.get(event.id);
    if (original === undefined || original.kind !== 'delivery') {
      continue;
    }
    if (original.strikerId === event.strikerId && original.nonStrikerId === event.nonStrikerId) {
      continue;
    }
    const swapped = original.strikerId === event.nonStrikerId && original.nonStrikerId === event.strikerId;
    return swapped ? original : null;
  }
  return null;
}

function keepStrikeResolution(context: Context, ops: readonly HistoryEditOp[]): EditResolution | null {
  const point = swapPoint(context, ops);
  if (point === null || point.kind !== 'delivery') {
    return null;
  }
  const candidate: HistoryEditOp[] = [...ops, { op: 'insert_before', seq: point.seq, events: [{ kind: 'strike_swapped' }] }];
  const outcome = resolveAutomatically(context, candidate);
  if (!outcome.ok) {
    return null;
  }
  const location = locate(context.original, point);
  const ball = shortBall(location) ?? 'the next ball';
  return {
    kind: 'keep_strike',
    automatic: false,
    label: 'Keep later balls',
    description: `Batters swap ends before ${ball}. Later balls stay as recorded.`,
    ops: outcome.ops,
  };
}

function dismissStrikerResolution(context: Context, ops: readonly HistoryEditOp[], failing: MatchEvent, strikerId: PlayerId): EditResolution | null {
  if (failing.kind !== 'delivery' || failing.wicket === null) {
    return null;
  }
  const followers = followersOf(context.events, failing);
  const touched = touchedSeqs(ops);
  if (followers.some((event) => touched.has(event.seq))) {
    return null;
  }
  const replacement: MatchEventInput = {
    ...(payloadOf(failing) as Extract<MatchEventInput, { readonly kind: 'delivery' }>),
    wicket: { ...failing.wicket, playerOutId: strikerId },
  };
  const candidate: HistoryEditOp[] = [
    ...ops,
    { op: 'replace', seq: failing.seq, with: [replacement, ...followers.map(payloadOf)] },
    ...followers.map((event): HistoryEditOp => ({ op: 'delete', seq: event.seq })),
  ];
  const outcome = resolveAutomatically(context, candidate);
  if (!outcome.ok) {
    return null;
  }
  const location = locate(context.original, failing);
  const ball = shortBall(location) ?? 'that ball';
  const striker = playerName(context.setup, strikerId);
  const recorded = playerName(context.setup, failing.wicket.playerOutId);
  return {
    kind: 'dismiss_striker',
    automatic: false,
    label: `Record ${striker} out`,
    description: `Out ${OUT_WORDS[failing.wicket.type]} on ${ball} instead of ${recorded}.`,
    ops: outcome.ops,
  };
}

function conflictOf(
  context: Context,
  failure: EditFailure,
  failing: MatchEvent,
  message: string,
  text: Explained,
  resolutions: readonly EditResolution[],
): EditConflict {
  const location = locate(context.original, failing);
  return {
    code: failure.code,
    message,
    headline: text.headline,
    ...(text.detail === undefined ? {} : { detail: text.detail }),
    reason: failure.message,
    atSeq: failing.seq,
    eventId: failing.id,
    inningsIndex: location.inningsIndex,
    ballLabel: location.ballLabel,
    resolutions,
  };
}

function strikerConflict(context: Context, ops: readonly HistoryEditOp[], failure: EditFailure, failing: MatchEvent, pre: MatchState): EditConflict | null {
  const innings = inProgressInnings(pre);
  if (failing.kind !== 'delivery' || failing.wicket === null || !isStrikerOnly(failing.wicket.type) || innings === null || innings.strikerId === null) {
    return null;
  }
  if (failing.wicket.playerOutId !== innings.nonStrikerId) {
    return null;
  }
  const location = locate(context.original, failing);
  const ball = ballPhrase(location) ?? 'a later ball';
  const striker = playerName(context.setup, innings.strikerId);
  const recorded = playerName(context.setup, failing.wicket.playerOutId);
  const how = OUT_WORDS[failing.wicket.type];
  const message = `${striker} is now on strike for ${ball}, but it records ${recorded} out ${how}.`;
  const short = shortBall(location);
  const text = explain(short === null ? 'Wrong batter out on a later ball' : `Wrong batter out on ${short}`, message);
  const resolutions = [keepStrikeResolution(context, ops), dismissStrikerResolution(context, ops, failing, innings.strikerId)].filter(
    (resolution): resolution is EditResolution => resolution !== null,
  );
  return conflictOf(context, failure, failing, message, text, resolutions);
}

function laterPlayConflict(context: Context, ops: readonly HistoryEditOp[], failure: EditFailure, failing: MatchEvent, pre: MatchState): EditConflict | null {
  const pending = pre.pendingAction?.type ?? null;
  if (pending === null || !TERMINAL_PENDING.includes(pending) || failing.kind === 'match_ended') {
    return null;
  }
  if (pending === 'start_next_innings' && failing.kind === 'innings_started') {
    return null;
  }
  const where = wherePhrase(failing, locate(context.original, failing));
  const text = explain(endHeadline(pre), `${capitalise(where)} and later play no longer count.`);
  const message = `${text.headline}. ${text.detail ?? ''}`.trim();
  const trim = trimResolution(context, ops, failing, pre);
  return conflictOf(context, failure, failing, message, text, trim === null ? [] : [trim]);
}

function genericConflict(context: Context, failure: EditFailure, failing: MatchEvent): EditConflict {
  const location = locate(context.original, failing);
  const where = wherePhrase(failing, location);
  const message = `After this change ${where} no longer fits: ${failure.message}`;
  const short = shortBall(location);
  const place = failing.kind === 'match_ended' ? 'The result' : short === null ? 'A later entry' : location.onBall ? capitalise(short) : `The entry after ${short}`;
  return conflictOf(context, failure, failing, message, explain(`${place} no longer fits`, failure.message), []);
}

function diagnose(context: Context, ops: readonly HistoryEditOp[], failure: EditFailure, offerChoices: boolean): Diagnosis {
  const failing = failingEvent(context, failure);
  const reopens = failing !== null && failing.kind === 'match_ended' && (failure.code === 'NATURAL_RESULT_NOT_REACHED' || failure.code === 'RESULT_NOT_TIED');
  if (failing === null || (!reopens && !offerChoices)) {
    return { automatic: null, conflict: null };
  }
  const log = normalisedLog(context, ops);
  if (log === null) {
    return { automatic: null, conflict: null };
  }
  const pre = stateBeforeEvent(context.setup, log, failing.id);
  if (reopens) {
    return { automatic: reopenResolution(context, ops, failing, pre), conflict: null };
  }
  if (failure.code === 'DISMISSED_PLAYER_NOT_AT_CREASE') {
    const striker = strikerConflict(context, ops, failure, failing, pre);
    if (striker !== null) {
      return { automatic: null, conflict: striker };
    }
  }
  const later = laterPlayConflict(context, ops, failure, failing, pre);
  if (later !== null) {
    return { automatic: null, conflict: later };
  }
  return { automatic: null, conflict: genericConflict(context, failure, failing) };
}

type Resolved =
  | { readonly ok: true; readonly outcome: EditSuccess; readonly ops: readonly HistoryEditOp[]; readonly applied: readonly EditResolution[] }
  | { readonly ok: false; readonly failure: EditFailure; readonly ops: readonly HistoryEditOp[]; readonly conflict: EditConflict | null };

function resolve(context: Context, ops: readonly HistoryEditOp[], offerChoices: boolean): Resolved {
  let current = ops;
  const applied: EditResolution[] = [];
  for (let round = 0; ; round += 1) {
    const outcome = applyHistoryEdits(context.setup, context.events, current, context.ctx);
    if (outcome.ok) {
      return { ok: true, outcome, ops: current, applied };
    }
    const diagnosis = diagnose(context, current, outcome, offerChoices);
    if (diagnosis.automatic !== null && round < AUTOMATIC_ROUNDS) {
      applied.push(diagnosis.automatic);
      current = diagnosis.automatic.ops;
      continue;
    }
    return { ok: false, failure: outcome, ops: current, conflict: diagnosis.conflict };
  }
}

function resolveAutomatically(context: Context, ops: readonly HistoryEditOp[]): Resolved {
  return resolve(context, ops, false);
}

function targetChanges(before: MatchState, after: MatchState): readonly EditTargetChange[] {
  const count = Math.max(before.innings.length, after.innings.length);
  const changes: EditTargetChange[] = [];
  for (let index = 0; index < count; index += 1) {
    const previous = before.innings[index]?.target?.runs ?? null;
    const next = after.innings[index]?.target?.runs ?? null;
    const innings = after.innings[index] ?? before.innings[index];
    if (previous !== next && innings !== undefined) {
      changes.push({ inningsIndex: index, teamId: innings.battingTeamId, before: previous, after: next });
    }
  }
  return changes;
}

function chaseLine(setup: MatchSetup, state: MatchState): { readonly line: string; readonly item: Explained } | null {
  const innings = inProgressInnings(state);
  if (innings === null) {
    return null;
  }
  const team = teamName(setup, innings.battingTeamId);
  const score = `${formatScore(innings.runs, innings.wickets)} after ${formatOvers(innings.legalBalls, setup.rules.ballsPerOver)} ${innings.legalBalls === setup.rules.ballsPerOver ? 'over' : 'overs'}`;
  const chase = state.chase;
  if (chase === null) {
    return { line: `${team} are ${score}.`, item: explain(`${team} ${score}`) };
  }
  return {
    line: `${team} are ${score} and need ${plural(chase.runsRequired, 'run')} from ${plural(chase.ballsRemaining, 'ball')}.`,
    item: explain(`${team} ${score}`, formatRequirement(chase.runsRequired, chase.ballsRemaining)),
  };
}

function targetLine(setup: MatchSetup, change: EditTargetChange): { readonly line: string; readonly item: Explained } {
  const team = teamName(setup, change.teamId);
  if (change.before === null) {
    return { line: `${team} now chase a target of ${change.after}.`, item: explain(`${team} now chase ${change.after}`) };
  }
  if (change.after === null) {
    return { line: `${team} no longer have a target of ${change.before}.`, item: explain(`${team} no longer chase ${change.before}`) };
  }
  return {
    line: `The target for ${team} changes from ${change.before} to ${change.after}.`,
    item: explain(`Target for ${team}: ${change.before} → ${change.after}`),
  };
}

export function describeEditConsequences(
  setup: MatchSetup,
  before: MatchState,
  after: MatchState,
  removedDeliveries = 0,
): EditConsequences {
  const reopensMatch = isTerminal(before) && !isTerminal(after);
  const targets = targetChanges(before, after);
  const entries = targets.map((change) => targetLine(setup, change));
  const lines: string[] = entries.map((entry) => entry.line);
  const items: Explained[] = entries.map((entry) => entry.item);
  const resultBefore = before.resultText;
  const resultAfter = after.resultText;
  if (reopensMatch) {
    lines.push(resultBefore === null ? 'The recorded result no longer stands, so the match is reopened.' : `“${resultBefore}” no longer stands, so the match is reopened.`);
    items.push(explain('Match reopens', resultBefore === null ? 'The recorded result no longer stands.' : `“${resultBefore}” no longer stands.`));
    const chase = chaseLine(setup, after);
    if (chase !== null) {
      lines.push(chase.line);
      items.push(chase.item);
    }
  } else if (isTerminal(before) && isTerminal(after) && resultBefore !== resultAfter && resultAfter !== null) {
    lines.push(resultBefore === null ? `The result becomes “${resultAfter}”.` : `The result changes from “${resultBefore}” to “${resultAfter}”.`);
    items.push(explain(`New result: ${resultAfter}`, resultBefore === null ? null : `Was “${resultBefore}”.`));
  }
  if (!isTerminal(after) && after.pendingAction?.type === 'confirm_result' && resultAfter !== null && (isTerminal(before) || before.pendingAction?.type !== 'confirm_result' || resultBefore !== resultAfter)) {
    lines.push(`The match now ends “${resultAfter}”. Confirm the result when you return to scoring.`);
    items.push(explain(`Now ends: ${resultAfter}`, 'Confirm the result when you return to scoring.'));
  }
  if (removedDeliveries > 0) {
    lines.push(`${plural(removedDeliveries, 'later ball')} ${removedDeliveries === 1 ? 'is' : 'are'} removed from the match.`);
    items.push(explain(`${plural(removedDeliveries, 'later ball')} removed`));
  }
  return { reopensMatch, resultBefore, resultAfter, targetChanges: targets, removedDeliveries, lines, items };
}

function laterRemovals(events: readonly MatchEvent[], ops: readonly HistoryEditOp[], outcome: EditSuccess): number {
  const first = ops[0];
  const primary = first !== undefined && first.op === 'delete' ? first.seq : null;
  const removed = new Set(outcome.diff.removedIds);
  return events.filter((event) => event.kind === 'delivery' && event.seq !== primary && removed.has(event.id)).length;
}

export function planHistoryEdit(
  setup: MatchSetup,
  events: readonly MatchEvent[],
  ops: readonly HistoryEditOp[],
  ctx: EditContext,
): PlannedHistoryEdit {
  const context: Context = { setup, events, original: replayMatch(setup, events), ctx };
  const resolved = resolve(context, ops, true);
  if (!resolved.ok) {
    return { ok: false, failure: resolved.failure, conflict: resolved.conflict };
  }
  return {
    ok: true,
    outcome: resolved.outcome,
    ops: resolved.ops,
    resolutions: resolved.applied,
    consequences: describeEditConsequences(setup, resolved.outcome.before, resolved.outcome.after, laterRemovals(events, resolved.ops, resolved.outcome)),
  };
}

import type { BallRecord, Explained, InningsState, MatchEvent, MatchSetup, MatchState } from '@/domain/types';
import type { HistoryEditPreview } from '@/services/contracts';
import { buildEvents, type ScoringIntent } from '@/domain/scoring/commands';
import type { HistoryEditOp } from '@/domain/scoring/history';
import { formatBowlingFigures, formatOvers, formatScore } from '@/domain/scoring/format';
import { replayMatch } from '@/domain/scoring/replay';
import { playerName, teamShortName } from '@/features/scoring/selectors/names';
import { chipOf, type ChipVM, type DotStyle } from '@/features/scoring/selectors/scoreboard';

export type EditChoice =
  | { readonly kind: 'replace'; readonly intent: ScoringIntent }
  | { readonly kind: 'insert_before'; readonly intent: ScoringIntent }
  | { readonly kind: 'delete' };

export type EditPlan =
  | { readonly ok: true; readonly ops: readonly HistoryEditOp[]; readonly notes: readonly string[] }
  | { readonly ok: false; readonly message: string };

export interface EditTarget {
  readonly event: Extract<MatchEvent, { readonly kind: 'delivery' }>;
  readonly ball: BallRecord | null;
  readonly innings: InningsState | null;
  readonly priorState: MatchState;
}

export function findEditTarget(setup: MatchSetup, events: readonly MatchEvent[], state: MatchState, seq: number): EditTarget | null {
  const event = events.find((entry) => entry.seq === seq);
  if (event === undefined || event.kind !== 'delivery') {
    return null;
  }
  const innings = state.innings.find((entry) => entry.balls.some((ball) => ball.seq === seq)) ?? null;
  const ball = innings?.balls.find((entry) => entry.seq === seq) ?? null;
  return { event, ball, innings, priorState: replayMatch(setup, events.filter((entry) => entry.seq < seq)) };
}

function followersOf(events: readonly MatchEvent[], target: MatchEvent): readonly MatchEvent[] {
  return events.filter((event) => event.actionId === target.actionId && event.seq > target.seq && event.kind === 'batter_in');
}

function withoutIncoming(intent: ScoringIntent): ScoringIntent {
  return intent.type === 'wicket' ? { ...intent, nextBatterId: null } : intent;
}

export function planEdit(setup: MatchSetup, events: readonly MatchEvent[], target: EditTarget, choice: EditChoice): EditPlan {
  const followers = followersOf(events, target.event);
  const wasWicket = target.event.wicket !== null;
  const removals = (): { readonly ops: HistoryEditOp[]; readonly notes: string[] } => ({
    ops: followers.map((event) => ({ op: 'delete', seq: event.seq })),
    notes: followers.map((event) => (event.kind === 'batter_in' ? `${playerName(setup, event.playerId)} no longer comes in` : '')).filter((note) => note !== ''),
  });
  if (choice.kind === 'delete') {
    const extra = wasWicket ? removals() : { ops: [], notes: [] };
    return { ok: true, ops: [{ op: 'delete', seq: target.event.seq }, ...extra.ops], notes: extra.notes };
  }
  const keepsWicket = choice.intent.type === 'wicket';
  const intent = choice.kind === 'replace' && wasWicket && keepsWicket ? withoutIncoming(choice.intent) : choice.intent;
  const built = buildEvents(setup, target.priorState, intent);
  if (!built.ok) {
    return { ok: false, message: built.message };
  }
  if (choice.kind === 'insert_before') {
    return { ok: true, ops: [{ op: 'insert_before', seq: target.event.seq, events: built.events }], notes: [] };
  }
  const extra = wasWicket && !keepsWicket ? removals() : { ops: [], notes: [] };
  return { ok: true, ops: [{ op: 'replace', seq: target.event.seq, with: built.events }, ...extra.ops], notes: extra.notes };
}

export interface ChangeRowVM {
  readonly key: string;
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly changed: boolean;
}

export interface EditPreviewVM {
  readonly newToken: ChipVM | null;
  readonly rows: readonly ChangeRowVM[];
  readonly result: ChangeRowVM;
  readonly resultChanged: boolean;
  readonly resultLine: string | null;
  readonly warning: Explained | null;
  readonly consequences: readonly Explained[];
  readonly reopensMatch: boolean;
  readonly requiresReason: boolean;
}

function row(key: string, label: string, before: string, after: string): ChangeRowVM {
  return { key, label, before, after, changed: before !== after };
}

function inningsRows(setup: MatchSetup, before: InningsState | undefined, after: InningsState | undefined): readonly ChangeRowVM[] {
  const bpo = setup.rules.ballsPerOver;
  const short = teamShortName(setup, (after ?? before)?.battingTeamId);
  const index = (after ?? before)?.index ?? 0;
  const score = (innings: InningsState | undefined) => (innings === undefined ? '–' : formatScore(innings.runs, innings.wickets));
  const overs = (innings: InningsState | undefined) => (innings === undefined ? '–' : formatOvers(innings.legalBalls, bpo, { alwaysShowBalls: true }));
  const rows: ChangeRowVM[] = [row(`score-${index}`, `${short} score`, score(before), score(after)), row(`overs-${index}`, `${short} overs`, overs(before), overs(after))].filter(
    (entry) => entry.changed,
  );
  const batterIds = new Set([...(before?.batting ?? []), ...(after?.batting ?? [])].map((entry) => entry.playerId));
  for (const playerId of batterIds) {
    const a = before?.batting.find((entry) => entry.playerId === playerId);
    const b = after?.batting.find((entry) => entry.playerId === playerId);
    const text = (entry: typeof a) => (entry === undefined || entry.status === 'yet_to_bat' ? '–' : `${entry.runs} (${entry.balls})${entry.status === 'out' ? ' out' : ''}`);
    const change = row(`bat-${index}-${playerId}`, playerName(setup, playerId), text(a), text(b));
    if (change.changed) {
      rows.push(change);
    }
  }
  const bowlerIds = new Set([...(before?.bowling ?? []), ...(after?.bowling ?? [])].map((entry) => entry.playerId));
  for (const playerId of bowlerIds) {
    const a = before?.bowling.find((entry) => entry.playerId === playerId);
    const b = after?.bowling.find((entry) => entry.playerId === playerId);
    const change = row(
      `bowl-${index}-${playerId}`,
      playerName(setup, playerId),
      a === undefined ? '–' : formatBowlingFigures(a, bpo),
      b === undefined ? '–' : formatBowlingFigures(b, bpo),
    );
    if (change.changed) {
      rows.push(change);
    }
  }
  return rows;
}

export function selectEditPreview(setup: MatchSetup, preview: HistoryEditPreview, dotStyle: DotStyle): EditPreviewVM {
  const { outcome } = preview;
  const inserted = new Set(outcome.diff.insertedIds);
  const newBall = outcome.after.innings.flatMap((innings) => innings.balls).find((ball) => inserted.has(ball.eventId)) ?? null;
  const rows = outcome.affectedInnings.flatMap((index) => inningsRows(setup, outcome.before.innings[index], outcome.after.innings[index]));
  const resultBefore = outcome.before.resultText ?? 'No result yet';
  const resultAfter = outcome.after.resultText ?? 'No result yet';
  const consequences = preview.consequences;
  const targetCount = consequences?.targetChanges.length ?? 0;
  const items: readonly Explained[] = consequences?.items ?? (consequences?.lines ?? []).map((line) => ({ headline: line }));
  const extra = (preview.resolutions ?? [])
    .filter((resolution) => resolution.automatic && resolution.kind !== 'reopen_match')
    .map((resolution): Explained => ({ headline: resolution.description }));
  const notices = [...items.slice(targetCount), ...extra];
  const fallback: Explained | null = outcome.resultChanged ? { headline: `Result changes: ${resultBefore} → ${resultAfter}` } : null;
  const warning = consequences === undefined ? fallback : notices[0] ?? fallback;
  const rest = consequences === undefined ? [] : [...items.slice(0, targetCount), ...notices.slice(1)];
  const unchanged = !outcome.resultChanged && warning === null && outcome.before.resultText !== null ? `Result: unchanged · ${outcome.before.resultText}` : null;
  return {
    newToken: newBall === null ? null : chipOf(newBall.token, dotStyle),
    rows,
    result: row('result', 'Result', resultBefore, outcome.resultChanged ? resultAfter : resultBefore),
    resultChanged: outcome.resultChanged,
    resultLine: unchanged,
    warning,
    consequences: rest,
    reopensMatch: consequences?.reopensMatch ?? false,
    requiresReason: preview.requiresReason,
  };
}

export function describeBall(setup: MatchSetup, ball: BallRecord | null, event: Extract<MatchEvent, { readonly kind: 'delivery' }>): string {
  const who = `${playerName(setup, event.bowlerId)} to ${playerName(setup, event.strikerId)}`;
  return ball === null ? who : `${ball.token.accessibilityLabel} · ${who}`;
}
